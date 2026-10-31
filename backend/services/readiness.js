const deductions = Object.freeze({
  missingDocument: 15,
  documentReviewPending: 8,
  unconfiguredChecklist: 15,
  verificationNotScheduled: 15,
  verificationPending: 10,
  verificationOverdue: 20,
  approvalPending: 15,
  approvalUnknown: 10,
  compensationOutstanding: 20,
  compensationUnknown: 10,
  rehabilitationOutstanding: 15,
  rehabilitationUnknown: 10,
  overdueMilestone: 10,
});

const isDate = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) ? date : null;
};

const documentTypes = (document) => [document?.type, document?.name]
  .filter(Boolean)
  .map((value) => String(value).trim().toLowerCase());

function calculateParcelReadiness(parcel, project, verifications = [], now = new Date()) {
  const weights = Object.fromEntries(Object.keys(deductions).map((key) => {
    const configured = project?.readinessWeights?.[key];
    return [key, Number.isFinite(configured) && configured >= 0 ? configured : deductions[key]];
  }));
  const factors = [];
  const addFactor = (key, title, deduction, nextStep, details = {}) => {
    factors.push({ key, title, deduction, nextStep, ...details });
  };

  const requirements = Array.isArray(project?.requiredDocumentTypes)
    ? [...new Map(project.requiredDocumentTypes
      .filter((item) => item !== null && item !== undefined)
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0)
      .map((item) => [item.toLowerCase(), item])).values()]
    : [];

  if (!requirements.length) {
    addFactor(
      "document_checklist_unconfigured",
      "Required document checklist is not configured",
      weights.unconfiguredChecklist,
      "Configure the mandatory document types for this project.",
      { kind: "data_gap" },
    );
  } else {
    const documents = (parcel.documents || []).map((document) => ({
      document,
      types: documentTypes(document),
    }));
    requirements.forEach((name) => {
      const matching = documents.filter(({ types }) => types.includes(name.toLowerCase()));
      if (!matching.length || matching.every(({ document }) => document.status === "rejected")) {
        addFactor(
          `missing_document:${name.toLowerCase()}`,
          matching.length ? `Required document rejected: ${name}` : `Missing required document: ${name}`,
          weights.missingDocument,
          matching.length
            ? `Correct and resubmit “${name}”.`
            : `Upload and submit “${name}” for review.`,
          { kind: "missing_document", recordId: parcel._id },
        );
      } else if (!matching.some(({ document }) => document.status === "approved")) {
        addFactor(
          `document_review_pending:${name.toLowerCase()}`,
          `Required document awaiting approval: ${name}`,
          weights.documentReviewPending,
          `Review the submitted “${name}” and record an approval decision.`,
          { kind: "pending_document_review", recordId: parcel._id },
        );
      }
    });
  }

  const latestVerification = verifications.reduce((latest, item) => {
    if (!latest) return item;
    const latestCreated = isDate(latest.createdAt)?.getTime() ?? -Infinity;
    const itemCreated = isDate(item.createdAt)?.getTime() ?? -Infinity;
    return itemCreated >= latestCreated ? item : latest;
  }, null);
  if (latestVerification?.verificationStatus !== "verified") {
    const dueDate = isDate(latestVerification?.dueDate);
    const overdue = latestVerification?.verificationStatus === "pending" && dueDate && dueDate < now;
    if (overdue) {
      addFactor(
        "field_verification_overdue",
        "Field inspection is overdue",
        weights.verificationOverdue,
        "Complete the overdue field inspection and record the findings.",
        { kind: "overdue_inspection", recordId: latestVerification._id, dueDate: latestVerification.dueDate },
      );
    } else if (latestVerification?.verificationStatus === "pending") {
      addFactor(
        "field_verification_pending",
        "Field verification is pending",
        weights.verificationPending,
        "Complete and submit the pending field verification.",
        { kind: "pending_inspection", recordId: latestVerification._id, dueDate: latestVerification.dueDate },
      );
    } else {
      addFactor(
        "field_verification_missing",
        latestVerification?.verificationStatus === "rejected"
          ? "The latest field verification was rejected"
          : "No completed field verification is recorded",
        weights.verificationNotScheduled,
        "Assign an officer and record a successful field inspection for this parcel.",
        { kind: "missing_inspection", recordId: latestVerification?._id || parcel._id },
      );
    }
  }

  if (parcel.approval?.status === "pending") {
    addFactor(
      "approval_pending",
      "Parcel approval is pending",
      weights.approvalPending,
      "Review the parcel file and record an approval decision.",
      { kind: "pending_approval", recordId: parcel._id },
    );
  } else if (parcel.approval?.status === "rejected") {
    addFactor(
      "approval_rejected",
      "Parcel approval was rejected",
      weights.approvalPending,
      "Address the reviewer’s rejection comments and resubmit the parcel file.",
      { kind: "rejected_approval", recordId: parcel._id },
    );
  } else if (!parcel.approval?.status) {
    addFactor(
      "approval_status_unknown",
      "Approval status is not recorded",
      weights.approvalUnknown,
      "Confirm whether this parcel requires approval and record its status.",
      { kind: "data_gap", recordId: parcel._id },
    );
  }

  if (parcel.rehabilitation?.required === true) {
    if (!parcel.rehabilitation.status || parcel.rehabilitation.status === "pending" || parcel.rehabilitation.status === "in_progress") {
      addFactor(
        "rehabilitation_outstanding",
        "Required rehabilitation and resettlement obligation is incomplete",
        weights.rehabilitationOutstanding,
        "Review the R&R plan, assign its responsible officer, and record completion milestones.",
        { kind: "outstanding_rehabilitation", recordId: parcel._id },
      );
    }
  } else if (parcel.rehabilitation?.required === undefined) {
    addFactor(
      "rehabilitation_status_unknown",
      "Rehabilitation and resettlement applicability is not recorded",
      weights.rehabilitationUnknown,
      "Assess whether an R&R obligation applies and record the decision.",
      { kind: "data_gap", recordId: parcel._id },
    );
  }

  const compensation = parcel.compensation;
  if (!compensation || !compensation.status) {
    addFactor(
      "compensation_status_unknown",
      "Compensation obligation is not recorded",
      weights.compensationUnknown,
      "Assess the compensation obligation or record that none is due.",
      { kind: "data_gap", recordId: parcel._id },
    );
  } else {
    const approved = Number(compensation.approvedAmount);
    const paid = Number(compensation.paidAmount);
    const hasAmounts = typeof compensation.approvedAmount === "number" &&
      Number.isFinite(approved) &&
      typeof compensation.paidAmount === "number" &&
      Number.isFinite(paid);
    const outstanding = hasAmounts ? Math.max(0, approved - paid) : null;
    const unpaid = ["pending", "approved", "partially_paid"].includes(compensation.status) ||
      (outstanding !== null && outstanding > 0);
    if (unpaid) {
      const dueDate = isDate(compensation.dueDate);
      const overdue = dueDate && dueDate < now;
      addFactor(
        overdue ? "compensation_overdue" : "compensation_outstanding",
        overdue
          ? `Compensation obligation overdue${outstanding === null ? "" : `: ${outstanding} outstanding`}`
          : outstanding === null
            ? "Compensation obligation is not fully paid"
            : `Outstanding compensation: ${outstanding}`,
        overdue ? weights.compensationOutstanding + 5 : weights.compensationOutstanding,
        overdue
          ? "Review the overdue compensation case and record the payment or approved exception."
          : "Verify the approved amount and record payment when completed.",
        {
          kind: overdue ? "overdue_compensation" : "outstanding_compensation",
          recordId: parcel._id,
          outstandingAmount: outstanding,
          dueDate: compensation.dueDate,
        },
      );
    } else if (compensation.status === "paid" && !hasAmounts) {
      addFactor(
        "compensation_amounts_unknown",
        "Paid compensation amounts are not recorded",
        weights.compensationUnknown,
        "Record the approved and paid amounts to verify that the obligation is settled.",
        { kind: "data_gap", recordId: parcel._id },
      );
    }
  }

  const overdueMilestones = (project?.milestones || []).filter((milestone) => {
    const dueDate = isDate(milestone.dueDate);
    return dueDate && dueDate < now && !["completed", "cancelled"].includes(milestone.status);
  });
  overdueMilestones.forEach((milestone) => {
    addFactor(
      `overdue_milestone:${milestone.name}`,
      `Project milestone overdue: ${milestone.name}`,
      weights.overdueMilestone,
      `Review the “${milestone.name}” milestone and update its status or due date.`,
      { kind: "overdue_milestone", recordId: project._id, dueDate: milestone.dueDate },
    );
  });

  const score = Math.round(Math.max(0, Math.min(100, 100 - factors.reduce((total, factor) => total + factor.deduction, 0))));
  const risk = score < 50 ? "high" : score < 75 ? "moderate" : "low";
  const nextSteps = factors
    .slice()
    .sort((first, second) => second.deduction - first.deduction)
    .map(({ nextStep, key }) => ({ key, action: nextStep }));

  return {
    parcelId: String(parcel._id),
    projectId: String(project?._id || parcel.project),
    score,
    risk,
    label: "Rules-based readiness indicator",
    factors,
    nextSteps,
    calculatedAt: now.toISOString(),
  };
}

module.exports = { calculateParcelReadiness, deductions };

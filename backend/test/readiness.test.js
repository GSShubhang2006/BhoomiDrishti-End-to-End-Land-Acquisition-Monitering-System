const assert = require("node:assert/strict");
const test = require("node:test");
const { calculateParcelReadiness } = require("../services/readiness");

const now = new Date("2025-06-01T00:00:00.000Z");
const parcel = {
  _id: "parcel-1",
  project: "project-1",
  documents: [{ type: "Title deed", status: "approved" }, { name: "Identity proof", status: "approved" }],
  approval: { status: "approved" },
  compensation: { status: "paid", approvedAmount: 500, paidAmount: 500 },
  rehabilitation: { required: false, status: "not_required" },
};
const project = {
  _id: "project-1",
  requiredDocumentTypes: ["Title deed", "Identity proof"],
  milestones: [{ name: "Survey", dueDate: "2025-05-01T00:00:00.000Z", status: "completed" }],
};

test("fully completed records produce a score of 100 and low risk", () => {
  const result = calculateParcelReadiness(
    parcel,
    project,
    [{ _id: "verification-1", verificationStatus: "verified" }],
    now,
  );

  assert.equal(result.score, 100);
  assert.equal(result.risk, "low");
  assert.deepEqual(result.factors, []);
});

test("missing checklist and workflow data are explicit deductions", () => {
  const result = calculateParcelReadiness({ _id: "parcel-2" }, { _id: "project-2" }, [], now);

  assert.equal(result.score, 40);
  assert.equal(result.risk, "high");
  assert.ok(result.factors.some((factor) => factor.key === "document_checklist_unconfigured"));
  assert.ok(result.factors.some((factor) => factor.key === "approval_status_unknown"));
  assert.ok(result.factors.some((factor) => factor.key === "compensation_status_unknown"));
  assert.ok(result.factors.some((factor) => factor.key === "rehabilitation_status_unknown"));
  assert.ok(result.nextSteps.length > 0);
});

test("overdue field verification and unpaid approved compensation are identified", () => {
  const result = calculateParcelReadiness(
    {
      ...parcel,
      rehabilitation: { required: false },
      compensation: { status: "partially_paid", approvedAmount: 1000, paidAmount: 250 },
    },
    project,
    [{ _id: "verification-2", verificationStatus: "pending", dueDate: "2025-05-01T00:00:00.000Z" }],
    now,
  );

  assert.ok(result.factors.some((factor) => factor.key === "field_verification_overdue"));
  assert.ok(result.factors.some((factor) => factor.key === "compensation_outstanding" && factor.outstandingAmount === 750));
  assert.equal(result.score, 60);
});

test("a newer completed verification supersedes an older overdue inspection", () => {
  const result = calculateParcelReadiness(
    parcel,
    project,
    [
      { _id: "verification-3", verificationStatus: "pending", dueDate: "2025-01-01T00:00:00.000Z" },
      { _id: "verification-4", verificationStatus: "verified", createdAt: "2025-05-01T00:00:00.000Z" },
    ],
    now,
  );

  assert.equal(result.score, 100);
  assert.ok(!result.factors.some((factor) => factor.kind === "overdue_inspection"));
  assert.ok(!result.factors.some((factor) => factor.kind === "outstanding_compensation"));
});

test("overdue compensation receives a stronger deduction than an open obligation", () => {
  const result = calculateParcelReadiness(
    {
      ...parcel,
      rehabilitation: { required: false },
      compensation: {
        status: "approved",
        approvedAmount: 1000,
        paidAmount: 0,
        dueDate: "2025-05-01T00:00:00.000Z",
      },
    },
    project,
    [{ _id: "verification-6", verificationStatus: "verified" }],
    now,
  );

  const factor = result.factors.find((item) => item.kind === "overdue_compensation");
  assert.equal(factor.deduction, 25);
  assert.equal(factor.outstandingAmount, 1000);
  assert.equal(result.score, 75);
});

test("project weights override defaults and rejected documents remain blockers", () => {
  const result = calculateParcelReadiness(
    {
      _id: "parcel-4",
      rehabilitation: { required: false },
      documents: [{ type: "Title deed", status: "rejected" }],
      approval: { status: "rejected" },
      compensation: { status: "paid", approvedAmount: 500, paidAmount: 500 },
    },
    {
      _id: "project-4",
      requiredDocumentTypes: ["Title deed"],
      readinessWeights: { missingDocument: 30, approvalPending: 25 },
    },
    [{ _id: "verification-7", verificationStatus: "verified" }],
    now,
  );

  assert.equal(result.score, 45);
  assert.equal(result.factors.find((factor) => factor.kind === "missing_document").deduction, 30);
  assert.equal(result.factors.find((factor) => factor.kind === "rejected_approval").deduction, 25);
});

test("a paid status without recorded amounts is not treated as complete", () => {
  const result = calculateParcelReadiness(
    {
      ...parcel,
      rehabilitation: { required: false },
      compensation: { status: "paid", approvedAmount: null, paidAmount: null },
    },
    project,
    [{ _id: "verification-8", verificationStatus: "verified" }],
    now,
  );

  assert.ok(result.factors.some((factor) => factor.key === "compensation_amounts_unknown"));
});

test("required but incomplete rehabilitation is an explainable blocker", () => {
  const result = calculateParcelReadiness(
    { ...parcel, rehabilitation: { required: true, status: "in_progress" } },
    project,
    [{ _id: "verification-9", verificationStatus: "verified" }],
    now,
  );

  assert.ok(result.factors.some((factor) => factor.key === "rehabilitation_outstanding"));
  assert.equal(result.score, 85);
});

test("score is clamped at zero and missing required documents have individual reasons", () => {
  const result = calculateParcelReadiness(
    { _id: "parcel-3", documents: [], approval: { status: "pending" }, compensation: { status: "pending" } },
    {
      _id: "project-3",
      requiredDocumentTypes: Array.from({ length: 10 }, (_, index) => `Document ${index}`),
      milestones: Array.from({ length: 5 }, (_, index) => ({
        name: `Milestone ${index}`,
        dueDate: "2025-01-01T00:00:00.000Z",
        status: "pending",
      })),
    },
    [{ _id: "verification-5", verificationStatus: "pending", dueDate: "2025-01-01T00:00:00.000Z" }],
    now,
  );

  assert.equal(result.score, 0);
  assert.equal(result.factors.filter((factor) => factor.kind === "missing_document").length, 10);
  assert.equal(result.risk, "high");
});

test("configured fractional deductions still produce an integer score and consistent risk band", () => {
  const result = calculateParcelReadiness(
    {
      ...parcel,
      compensation: { status: "approved", approvedAmount: 100, paidAmount: 0 },
      rehabilitation: { required: false, status: "not_required" },
    },
    { ...project, readinessWeights: { compensationOutstanding: 2.7 } },
    [{ _id: "verification-complete", verificationStatus: "verified" }],
    now,
  );
  assert.equal(Number.isInteger(result.score), true);
  assert.equal(result.score, 97);
  assert.equal(result.risk, "low");
});

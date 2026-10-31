const mongoose = require("mongoose");
const FieldVerification = require("../models/FieldVerification");
const LandParcel = require("../models/LandParcel");
const { calculateParcelReadiness } = require("../services/readiness");

const getReadiness = async (req, res) => {
  const { projectId, parcelId } = req.query;
  if (projectId && !mongoose.isObjectIdOrHexString(projectId)) {
    return res.status(400).json({ message: "Invalid projectId" });
  }
  if (parcelId && !mongoose.isObjectIdOrHexString(parcelId)) {
    return res.status(400).json({ message: "Invalid parcelId" });
  }

  try {
    const filter = {};
    if (projectId) filter.project = projectId;
    if (parcelId) filter._id = parcelId;

    const parcels = await LandParcel.find(filter)
      .populate("project")
      .sort({ createdAt: -1 });
    const parcelIds = parcels.map((parcel) => parcel._id);
    const verifications = await FieldVerification.find({ landParcel: { $in: parcelIds } })
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    const verificationsByParcel = new Map();
    verifications.forEach((verification) => {
      const key = String(verification.landParcel);
      const records = verificationsByParcel.get(key) || [];
      records.push(verification);
      verificationsByParcel.set(key, records);
    });

    const readiness = parcels.map((parcel) => calculateParcelReadiness(
      parcel.toObject(),
      parcel.project?.toObject ? parcel.project.toObject() : parcel.project,
      verificationsByParcel.get(String(parcel._id)) || [],
    ));
    return res.status(200).json({ readiness });
  } catch (error) {
    console.error("Failed to calculate parcel readiness:", error.message);
    return res.status(500).json({ message: "Failed to calculate parcel readiness" });
  }
};

module.exports = { getReadiness };

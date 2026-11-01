const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const LandParcel = require('../models/LandParcel');
const { surveyDuplicateFilter } = require('../controllers/landParcelController');

test('survey references are preserved as strings and currency uses an ISO code', async () => {
  const parcel = new LandParcel({
    project: new mongoose.Types.ObjectId(),
    surveyNumber: ' 001/02-A ',
    area: 1.25,
    areaUnit: 'acres',
    compensation: { estimatedAmount: 125000, currency: 'INR' },
  });
  await parcel.validate();
  assert.equal(parcel.surveyNumber, '001/02-A');
  assert.equal(parcel.compensation.currency, 'INR');
});

test('survey reference duplicate queries use location when available and project fallback otherwise', () => {
  const projectId = new mongoose.Types.ObjectId();
  const locationScoped = surveyDuplicateFilter({
    project: projectId,
    surveyNumber: '01/02-A',
    location: { stateCode: 'DL', district: 'New Delhi', village: 'Example locality' },
  });
  assert.equal(locationScoped.project, undefined);
  assert.equal(locationScoped.surveyNumber.$options, 'i');
  assert.equal(locationScoped['location.stateCode'].$regex, '^DL$');
  assert.equal(locationScoped['location.village'].$regex, '^Example locality$');

  const projectScoped = surveyDuplicateFilter({ project: projectId, surveyNumber: '001' });
  assert.equal(projectScoped.project, projectId);
  assert.equal(projectScoped.surveyNumber.$regex, '^001$');
});

test('parcel amounts reject negative values and malformed currency codes', async () => {
  const parcel = new LandParcel({
    project: new mongoose.Types.ObjectId(),
    surveyNumber: '01',
    area: 1,
    compensation: { approvedAmount: -1, currency: 'R' },
  });
  await assert.rejects(parcel.validate(), (error) => {
    assert.ok(error.errors['compensation.approvedAmount']);
    assert.ok(error.errors['compensation.currency']);
    return true;
  });
});

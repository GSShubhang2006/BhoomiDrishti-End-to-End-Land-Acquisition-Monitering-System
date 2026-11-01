const express = require('express');
const { requireRole } = require('../middleware/authentication');
const {
  assignReviewer,
  createProposal,
  getProposal,
  getReviewers,
  linkProject,
  listProposals,
  reviewProposal,
  submitProposal,
  updateProposal,
  withdrawProposal,
} = require('../controllers/acquisitionProposalController');

const router = express.Router();

router.get('/', listProposals);
router.get('/reviewers', requireRole('admin', 'project_officer'), getReviewers);
router.post('/', requireRole('admin', 'project_officer'), createProposal);
router.get('/:id', getProposal);
router.put('/:id', requireRole('admin', 'project_officer'), updateProposal);
router.post('/:id/submit', requireRole('admin', 'project_officer'), submitProposal);
router.post('/:id/assign-reviewer', requireRole('admin'), assignReviewer);
router.post('/:id/review', requireRole('admin', 'reviewer'), reviewProposal);
router.post('/:id/withdraw', requireRole('admin', 'project_officer'), withdrawProposal);
router.post('/:id/link-project', requireRole('admin', 'project_officer'), linkProject);

module.exports = router;

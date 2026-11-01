const express = require('express');
const { requireRole } = require('../middleware/authentication');
const {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  archiveProject,
  deleteProject,
} = require('../controllers/projectController');

const router = express.Router();

router.post('/', requireRole('admin', 'project_officer'), createProject);
router.get('/', getProjects);
router.get('/:id', getProjectById);
router.put('/:id', requireRole('admin', 'project_officer'), updateProject);
router.post('/:id/archive', requireRole('admin', 'project_officer'), archiveProject);
router.delete('/:id', requireRole('admin'), deleteProject);

module.exports = router;
const mongoose = require('mongoose');
const Project = require('../models/Project');
const { store, getProjectById: findProjectById, createId } = require('../data/mockStore');
const { isDbReady } = require('../config/db');

const createProject = async (req, res) => {
  try {
    if (!isDbReady()) {
      const project = {
        ...req.body,
        _id: createId('project'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.projects.unshift(project);
      return res.status(201).json({
        message: 'Project created successfully',
        project,
      });
    }

    const project = await Project.create(req.body);
    return res.status(201).json({
      message: 'Project created successfully',
      project,
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({
        message: 'Project validation failed',
        error: error.message,
      });
    }

    return res.status(500).json({
      message: 'Failed to create project',
      error: error.message,
    });
  }
};

const getProjects = async (req, res) => {
  try {
    if (!isDbReady()) {
      return res.status(200).json({ projects: store.projects });
    }

    const projects = await Project.find();
    return res.status(200).json({ projects });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to get projects',
      error: error.message,
    });
  }
};

const getProjectById = async (req, res) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id) && !req.params.id.startsWith('project_')) {
      return res.status(400).json({ message: 'Invalid project ID' });
    }

    if (!isDbReady()) {
      const project = findProjectById(req.params.id);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }
      return res.status(200).json({ project });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    return res.status(200).json({ project });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to get project',
      error: error.message,
    });
  }
};

const updateProject = async (req, res) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id) && !req.params.id.startsWith('project_')) {
      return res.status(400).json({ message: 'Invalid project ID' });
    }

    if (!isDbReady()) {
      const index = store.projects.findIndex((project) => String(project._id) === String(req.params.id));
      if (index === -1) {
        return res.status(404).json({ message: 'Project not found' });
      }
      store.projects[index] = {
        ...store.projects[index],
        ...req.body,
        _id: store.projects[index]._id,
        updatedAt: new Date(),
      };
      return res.status(200).json({
        message: 'Project updated successfully',
        project: store.projects[index],
      });
    }

    const project = await Project.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    return res.status(200).json({
      message: 'Project updated successfully',
      project,
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({
        message: 'Project validation failed',
        error: error.message,
      });
    }

    return res.status(500).json({
      message: 'Failed to update project',
      error: error.message,
    });
  }
};

const deleteProject = async (req, res) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id) && !req.params.id.startsWith('project_')) {
      return res.status(400).json({ message: 'Invalid project ID' });
    }

    if (!isDbReady()) {
      const index = store.projects.findIndex((project) => String(project._id) === String(req.params.id));
      if (index === -1) {
        return res.status(404).json({ message: 'Project not found' });
      }
      const [project] = store.projects.splice(index, 1);
      return res.status(200).json({
        message: 'Project deleted successfully',
        project,
      });
    }

    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    return res.status(200).json({
      message: 'Project deleted successfully',
      project,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to delete project',
      error: error.message,
    });
  }
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
};
const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { auth, adminOnly } = require('../middleware/auth');

router.use(auth); // every task route needs a login

router.get('/', taskController.getTasks);
router.get('/stats', taskController.getTaskStats);
router.post('/', taskController.createTask);
router.put('/:id', taskController.updateTask);
router.delete('/:id', adminOnly, taskController.deleteTask);

module.exports = router;
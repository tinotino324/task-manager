const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { auth, adminOnly } = require('../middleware/auth');

router.get('/', auth, adminOnly, userController.getUsers);
router.get('/getUsersRow', auth, adminOnly, userController.getUsersRow);

module.exports = router;
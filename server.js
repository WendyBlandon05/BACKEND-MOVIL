require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Conectar a MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Atlas conectado'))
    .catch(err => console.error('Error conectando a MongoDB:', err));

// Modelo dinámico para tu colección (no requiere definir campos)
const AnyCollection = mongoose.model('AnyCollection', new mongoose.Schema({}, { strict: false }), 'Cargos');

// Endpoint GET: devuelve todos los documentos
app.get('/items', async (req, res) => {
    try {
        const data = await AnyCollection.find();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint POST: agrega un nuevo documento
app.post('/items', async (req, res) => {
    try {
        const newItem = new AnyCollection(req.body);
        await newItem.save();
        res.json(newItem);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Puerto
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Servidor corriendo en puerto ${PORT}'));
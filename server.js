//carga las variables definifas en el archivo .env
require('dotenv').config();
//importa el framework web para node
const express = require('express');
//importa la libreria para conectar datos con mongo
const mongoose = require('mongoose');
//para las peticiones dedsde otros origenes
const cors = require('cors');

const app = express();
//habilia la peticiones desde cualquier origen
app.use(cors());
app.use(express.json());

// Conectar a Atlas con monguse y la variable en el .env
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Atlas conectado'))
    .catch(err => console.error('Error conectando a MongoDB:', err));


const AnyCollection = mongoose.model('AnyCollection', new mongoose.Schema({}, { strict: false }), 'Cargos');

const Empleados = mongoose.model('Empleados', new mongoose.Schema({}, { strict: false }), 'Empleados');
const Contratos = mongoose.model('Contratos', new mongoose.Schema({}, { strict: false }), 'Contratos');
const Departamentos = mongoose.model('Departamentos', new mongoose.Schema({}, { strict: false }), 'Departamentos');


// Endpoint GE
app.get('/items', async (req, res) => {
    try {
        const data = await AnyCollection.find();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint POST
app.post('/items', async (req, res) => {
    try {
        const newItem = new AnyCollection(req.body);
        await newItem.save();
        res.json(newItem);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


//NUEVAS APIS
//EMPLEADOS POR GENERO
app.get('/empleados/genero', async (req, res) => {
  try {
    const result = await Empleados.aggregate([
      { $group: { _id: "$sexo", total: { $count: {} } } }
    ]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//COUNT A EMPLEADOS
app.get('/empleados/activos', async (req, res) => {
  try {
    const count = await Empleados.countDocuments({ is_active: true });
    res.json({ total_activos: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//EMPLEADOS POR EPARTEMANTO 
app.get('/empleados/departamento', async (req, res) => {
  try {
    const result = await Contratos.aggregate([
      {
        $lookup: {
          from: "Empleados",
          localField: "IdEmpleado",
          foreignField: "_id",
          as: "empleado"
        }
      },
      { $unwind: "$empleado" },
      {
        $lookup: {
          from: "Departamentos",
          localField: "IdDepartamento",
          foreignField: "_id",
          as: "departamento"
        }
      },
      { $unwind: "$departamento" },
      {
        $group: {
          _id: "$departamento.Nombre",
          total_empleados: { $sum: 1 }
        }
      }
    ]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Puerto
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Servidor corriendo en puerto ${PORT}'));
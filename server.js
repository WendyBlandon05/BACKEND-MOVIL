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



///contar empleados por rangos de edad
app.get('/empleados/edad', async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const pivot = currentYear % 100;

    const pipeline = [
      { $addFields: { yearTwoDigits: { $toInt: { $substr: ["$numero_cedula", 8, 2] } } } },
      { 
        $addFields: { 
          birthYear: {
            $cond: [
              { $gt: ["$yearTwoDigits", pivot] },
              { $add: [1900, "$yearTwoDigits"] },
              { $add: [2000, "$yearTwoDigits"] }
            ]
          }
        } 
      },
      { $addFields: { edad: { $subtract: [currentYear, "$birthYear"] } } },
      { $addFields: { decadeStart: { $multiply: [ { $floor: { $divide: ["$edad", 10] } }, 10 ] } } },
      { $group: { _id: "$decadeStart", total: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { 
        $project: { 
          _id: 0,
          rango: { 
            $concat: [
              { $toString: "$_id" },
              "-",
              { $toString: { $add: ["$_id", 9] } }
            ]
          },
          total: 1
        }
      }
    ];

    const result = await Empleados.aggregate(pipeline);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


//Numeor de empleados por contrato
app.get('/contratos/tipo', async (req, res) => {
  try {
    const result = await Contratos.aggregate([
      {
        $group: {
          _id: "$TipoContrato",
          total_empleados: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          tipoContrato: "$_id",
          total_empleados: 1
        }
      }
    ]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//PANTALLA "PERMISOS"
//permiso mas popular

app.get('/permisos/popular', async (req, res) => {
  try {
    const result = await Empleados.aggregate([
      { $unwind: "$detallepermisos" },
      { $group: { _id: "$detallepermisos.descripcion", total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 1 }
    ]);
    res.json(result[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


//Dias perdidos por los permisos
app.get('/permisos/diasperdidos', async (req, res) => {
  try {
    const result = await Empleados.aggregate([
      { $unwind: "$detallepermisos" },
      {
        $project: {
          dias: {
            $divide: [
              { $subtract: ["$detallepermisos.fechafin", "$detallepermisos.fechainicio"] },
              1000 * 60 * 60 * 24 // milisegundos a días
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          totalDias: { $sum: "$dias" }
        }
      }
    ]);

    // Si hay resultado, redondeamos el total de días
    const total = result.length > 0 ? Math.round(result[0].totalDias) : 0;
    res.json({ dias_perdidos: total });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


//permisos por el mes actual

// Permisos del mes actual (devuelve 0 si no hay)
app.get('/permisos/mes', async (req, res) => {
  try {
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const finMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);

    const result = await Empleados.aggregate([
      { $unwind: "$detallepermisos" },
      {
        $match: {
          "detallepermisos.fechainicio": { $gte: inicioMes, $lt: finMes }
        }
      },
      { $count: "totalPermisosMes" },
      {
        $unionWith: {
          coll: "Empleados",
          pipeline: [
            { $limit: 1 },
            { $project: { totalPermisosMes: { $literal: 0 } } }
          ]
        }
      },
      { $limit: 1 }
    ]);

    const total = result.length > 0 ? result[0].totalPermisosMes : 0;
    res.json({ permisos_mes_actual: total });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Promedio de días por permiso (entero)
app.get('/permisos/promedio', async (req, res) => {
  try {
    const result = await Empleados.aggregate([
      { $unwind: "$detallepermisos" },
      {
        $project: {
          dias: {
            $divide: [
              { $subtract: ["$detallepermisos.fechafin", "$detallepermisos.fechainicio"] },
              1000 * 60 * 60 * 24 // convertir milisegundos a días
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          promedioDias: { $avg: "$dias" }
        }
      }
    ]);

    // Redondear el promedio (entero)
    const promedio = result.length > 0 ? Math.round(result[0].promedioDias) : 0;

    res.json({ promedio_dias: promedio });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Permisos agrupados por años como histo
app.get('/permisos/poryear', async (req, res) => {
  try {
    const result = await Empleados.aggregate([
      { $unwind: "$detallepermisos" },
      {
        $project: {
          year: { $year: "$detallepermisos.fechainicio" }
        }
      },
      {
        $group: {
          _id: "$year",
          total: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    // Formatear salida
    const data = result.map(r => ({
      anio: r._id,
      total_permisos: r.total
    }));

    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Género con más permisos
app.get('/permisos/genero', async (req, res) => {
  try {
    const result = await Empleados.aggregate([
      { $unwind: "$detallepermisos" },
      {
        $group: {
          _id: "$sexo",
          total: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } },
      { $limit: 1 }
    ]);

    const data = result.length > 0
      ? { genero: result[0]._id, total_permisos: result[0].total }
      : { genero: null, total_permisos: 0 };

    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//// Área con más permisos
app.get('/permisos/departamento-popular', async (req, res) => {
  try {
    const result = await Empleados.aggregate([
      { $unwind: "$detallepermisos" },
      {
        $lookup: {
          from: "Contratos",
          localField: "_id",
          foreignField: "IdEmpleado",
          as: "contrato"
        }
      },
      { $unwind: "$contrato" },
      {
        $lookup: {
          from: "Departamentos",
          localField: "contrato.IdDepartamento",
          foreignField: "_id",
          as: "departamento"
        }
      },
      { $unwind: "$departamento" },
      {
        $group: {
          _id: "$departamento.Nombre",
          total: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } },
      { $limit: 1 }
    ]);

    const data = result.length > 0
      ? { departamento: result[0]._id, total_permisos: result[0].total }
      : { departamento: null, total_permisos: 0 };

    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


//CONTRATOS
// Tipo de contrato más común
app.get('/contratos/tipo-popular', async (req, res) => {
  try {
    const result = await Contratos.aggregate([
      { $group: { _id: "$TipoContrato", total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 1 }
    ]);

    const data = result.length > 0
      ? { tipo_contrato: result[0]._id, total: result[0].total }
      : { tipo_contrato: null, total: 0 };

    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Contratos vigentes
app.get('/contratos/vigentes', async (req, res) => {
  try {
    const total = await Contratos.countDocuments({
      FechaInicio: { $lte: new Date() },
      FechaFin: { $gte: new Date() }
    });

    res.json({ contratos_vigentes: total });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Promedio de duración de contratos (en meses)
app.get('/contratos/promedio-meses', async (req, res) => {
  try {
    const result = await Contratos.aggregate([
      {
        $project: {
          meses: {
            $divide: [
              { $subtract: ["$FechaFin", "$FechaInicio"] },
              1000 * 60 * 60 * 24 * 30 // milisegundos → meses aproximados
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          promedio: { $avg: "$meses" }
        }
      }
    ]);

    const meses = result.length > 0 ? Math.round(result[0].promedio) : 0;

    res.json({ meses_promedio: meses });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Contratos por género
app.get('/contratos/por-genero', async (req, res) => {
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
        $group: {
          _id: "$empleado.sexo",
          total: { $sum: 1 }
        }
      }
    ]);

    const data = result.map(r => ({
      genero: r._id,
      total_contratos: r.total
    }));

    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// Puerto
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Servidor corriendo en puerto ${PORT}'));
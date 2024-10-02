const express = require('express');
const http = require('http');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const socketIo = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const pool = new Pool({
  user: 'adminpg',
  host: 'app.variamos.com',
  database: 'VariamosDB',
  password: 'a=m=8hos.G!-s<*M1G',
  port: 5433,
});

const queryDB = async (text, params) => {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (err) {
    console.error('Error ejecutando consulta:', err);
    throw err;
  }
};


let guestCounter = 1;
const connectedUsers = {};
const guests = {};
const workspaces = {}; // Estructura para almacenar usuarios por workspace

app.use(cors());
app.use(express.json());

io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);

  // Registrar usuarios como invitados
  socket.on('signUpAsGuest', () => {
    const guestId = guestCounter++;
    guests[socket.id] = guestId;
    socket.emit('guestIdAssigned', { guestId });
    console.log(`Guest signed up: ${guestId} (Socket ID: ${socket.id})`); // Log cuando se registra un nuevo invitado
  });

  socket.on('registerUser', async (userData) => {
    connectedUsers[userData.email] = socket.id;
    console.log(`${userData.email} registrado con socket ID ${socket.id}`);
  
    // Guardar la información del usuario en la base de datos
    const query = `
      INSERT INTO testvariamos.users (email, socket_id, name)
      VALUES ($1, $2, $3)
      ON CONFLICT (email)
      DO UPDATE SET socket_id = EXCLUDED.socket_id, name = EXCLUDED.name
    `;
    const values = [userData.email, socket.id, userData.name || ''];
  
    try {
      await queryDB(query, values);
      console.log(`User ${userData.email} has been saved/updated in the database`);
    } catch (err) {
      console.error('Error saving user data in the database:', err);
    }
  });

  // Gestionar invitaciones para colaborar
  // Gestionar invitaciones para colaborar
// Gestionar invitaciones para colaborar
socket.on('sendInvitation', (data) => {
  const invitedSocketId = connectedUsers[data.invitedUserEmail];
  if (invitedSocketId) {
    io.to(invitedSocketId).emit('invitationReceived', data);
    console.log(`${data.inviterName} ha invitado a ${data.invitedUserEmail} a colaborar en el workspace ${data.workspaceId}`);
    
    // Hacer que el anfitrión también se una al workspace
    socket.join(data.workspaceId); // El socket del anfitrión se une al workspace
    console.log(`Host joined workspace ${data.workspaceId} (Socket ID: ${socket.id})`);
  } else {
    console.log(`User ${data.invitedUserEmail} not found or not connected.`);
  }
});

  // Manejar el evento de unirse a un workspace
// Manejar el evento de unirse a un workspace
socket.on('joinWorkspace', async (data) => {
  const { clientId, workspaceId } = data;

  // Unir el socket al room correspondiente al workspace
  socket.join(workspaceId);
  console.log(`Client ${clientId} joined workspace ${workspaceId} (Socket ID: ${socket.id})`);

  // Guardar la relación entre el cliente y el workspace en la base de datos
  const query = `INSERT INTO testvariamos.workspace_users (workspace_id, client_id, socket_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`;
  const values = [workspaceId, clientId, socket.id];

  try { 
    await queryDB(query, values);
    console.log(`Client ${clientId} added to workspace ${workspaceId} in the database`);
  } catch (err) {
    console.error('Error saving workspace join in the database:', err);
  }

  // Verificar si el proyecto por defecto "My Project" ya existe en el workspace
  const checkProjectQuery = `SELECT * FROM testvariamos.projects WHERE workspace_id = $1 AND name = $2`;
  const projectValues = [workspaceId, 'My Project'];

  try {
    const projectResult = await queryDB(checkProjectQuery, projectValues);

    if (projectResult.rowCount === 0) {
      // Si no existe, crear el proyecto "My Project"
      const projectId = uuidv4();
      const insertProjectQuery = `INSERT INTO testvariamos.projects (id, name, workspace_id) VALUES ($1, $2, $3)`;
      const insertProjectValues = [projectId, 'My Project', workspaceId];
      
      try {
        await queryDB(insertProjectQuery, insertProjectValues);
        console.log(`Project "My Project" created for workspace ${workspaceId}`);

        // Emitir el evento de creación del proyecto al usuario que se unió
        io.to(socket.id).emit('projectCreated', {
          clientId,
          workspaceId,
          project: { id: projectId, name: 'My Project' }
        });
      } catch (err) {
        console.error('Error creating "My Project":', err);
      }
    } else {
      console.log(`Project "My Project" already exists in workspace ${workspaceId}`);
      
      // Emitir el evento de proyecto ya existente al usuario
      io.to(socket.id).emit('projectCreated', {
        clientId,
        workspaceId,
        project: projectResult.rows[0] // Emitimos el proyecto existente
      });
    }
  } catch (err) {
    console.error('Error checking for "My Project" in workspace:', err);
  }

  // Verificar si el anfitrión está unido al workspace
  const clientsInWorkspace = io.sockets.adapter.rooms.get(workspaceId);
  if (clientsInWorkspace) {
    clientsInWorkspace.forEach(socketId => {
      console.log(`User in workspace: ${socketId}`);
    });
  }

  // Notificar al cliente que ha unido un workspace
  io.to(socket.id).emit('workspaceJoined', { clientId, workspaceId });
});

  
  // Manejar la creación de proyectos
  socket.on('projectCreated', async (data) => {
    console.log('Server received projectCreated:', data);

    const query = `INSERT INTO testvariamos.projects(id, name, workspace_id) VALUES($1, $2, $3)`;
    const values = [data.project.id, data.project.name, data.workspaceId];

    try {
        await queryDB(query, values);
        console.log(`Proyecto guardado en la base de datos: ${data.project.name}`);

        // Emitir el evento de creación de proyecto a todos los usuarios del workspace
        io.to(data.workspaceId).emit('projectCreated', data);

    } catch (err) {
        console.error('Error guardando el proyecto en la base de datos:', err);
    }
});

// Manejar la creación de productLines
socket.on('productLineCreated', async (data) => {
  console.log('Server received productLineCreated:', data);

  const query = `INSERT INTO testvariamos.productlines(id, name, type, domain, project_id, workspace_id) 
                 VALUES($1, $2, $3, $4, $5, $6)`;
  const values = [data.productLine.id, data.productLine.name, data.productLine.type, data.productLine.domain, data.projectId, data.workspaceId];

  try {
      await queryDB(query, values);
      console.log(`ProductLine guardada en la base de datos: ${data.productLine.name}`);

      // Emitir el evento de creación de ProductLine a todos los usuarios del workspace
      io.to(data.workspaceId).emit('productLineCreated', data);

  } catch (err) {
      console.error('Error guardando la ProductLine en la base de datos:', err);
  }
});


  // Emitir eventos solo a los usuarios del mismo workspace
  socket.on('modelCreated', async (data) => {
    console.log('Server received modelCreated:', data);
  
    const query = `INSERT INTO testvariamos.models(id, name, type, data, workspace_id, project_id, product_line_id)
                   VALUES($1, $2, $3, $4, $5, $6, $7)`;
    const values = [data.model.id, data.model.name, data.model.type, JSON.stringify(data.model), data.workspaceId,data.projectId, data.productLineId];
  
    try {
      await queryDB(query, values);
      console.log(`Modelo guardado en la base de datos: ${data.model.name}`);
    } catch (err) {
      console.error('Error guardando el modelo:', err);
    }
  
    io.to(data.workspaceId).emit('modelCreated', data);
  });
  
  // Manejar la eliminación de un modelo
  socket.on('modelDeleted', async (data) => {
    console.log(`Server received modelDeleted:`, data);
  
    const query = `DELETE FROM testvariamos.models WHERE id = $1`;
    const values = [data.modelId];
  
    try {
      await queryDB(query, values);
      console.log(`Modelo eliminado de la base de datos: ${data.modelId}`);
    } catch (err) {
      console.error('Error eliminando el modelo:', err);
    }
  
    io.to(data.workspaceId).emit('modelDeleted', data);  // Retransmitir a todos en el workspace
  });
  
  
  // Manejar el renombramiento de un modelo
  socket.on('modelRenamed', async (data) => {
    console.log(`Server received modelRenamed:`, data);
  
    const query = `UPDATE testvariamos.models SET name = $1 WHERE id = $2`;
    const values = [data.newName, data.modelId];
  
    try {
      await queryDB(query, values);
      console.log(`Nombre del modelo actualizado en la base de datos: ${data.modelId}`);
    } catch (err) {
      console.error('Error actualizando el nombre del modelo:', err);
    }
  
    io.to(data.workspaceId).emit('modelRenamed', data);
  });
  
  // Manejar la configuración de un modelo
  socket.on('modelConfigured', async (data) => {
    console.log(`Server received modelConfigured:`, data);
  
    const query = `UPDATE testvariamos.models SET data = $1 WHERE id = $2`;
    const values = [JSON.stringify(data.configuration), data.modelId];
  
    try {
      await queryDB(query, values);
      console.log(`Modelo configurado actualizado en la base de datos: ${data.modelId}`);
    } catch (err) {
      console.error('Error actualizando el modelo configurado:', err);
    }
  
    io.to(data.workspaceId).emit('modelConfigured', data);
  });

  socket.on('configurationCreated', async (data) => {
    console.log('Server received configurationCreated:', data);
  
    const query = `
      INSERT INTO testvariamos.configurations (id, name, query, project_id, workspace_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, query = EXCLUDED.query
    `;
    const values = [data.id, data.name, JSON.stringify(data.query), data.projectId, data.workspaceId];
  
    try {
      await queryDB(query, values);
      console.log(`Configuration ${data.name} saved/updated in the database`);
  
      // Emitir el evento a todos los usuarios del workspace
      io.to(data.workspaceId).emit('configurationCreated', data);
    } catch (err) {
      console.error('Error saving configuration in the database:', err);
    }
  });

  socket.on('getAllConfigurations', async (data) => {
    const { workspaceId } = data;
    console.log(`Fetching configurations for workspace: ${workspaceId}`);
  
    const query = 'SELECT * FROM testvariamos.configurations WHERE workspace_id = $1';
    const values = [workspaceId];
  
    try {
      const result = await queryDB(query, values);
      const configurations = result.rows;
      
      // Asegúrate de loggear las configuraciones antes de enviarlas
      console.log(`Configurations fetched: ${JSON.stringify(configurations)}`);
      
      // Emitir las configuraciones al cliente
      socket.emit('allConfigurationsReceived', configurations);
    } catch (err) {
      console.error('Error fetching configurations:', err);
    }
  });
    
  socket.on('configurationApplied', async (data) => {
    console.log('Server received configurationApplied:', data);
  
    // Emitir el evento a todos los usuarios del workspace
    io.to(data.workspaceId).emit('configurationApplied', data);
  });

  // Manejar la eliminación de configuraciones en el workspace
socket.on('configurationDeleted', async (data) => {
  console.log('Server received configurationDeleted:', data);

  // Emitir el evento a todos los usuarios del workspace
  io.to(data.workspaceId).emit('configurationDeleted', data);
});

  
  socket.on('cellMoved', async (data) => {
    console.log('Server received cellMoved:', data);
  
    const query = `UPDATE testvariamos.cells SET data = $1 WHERE id = $2`;
    const values = [JSON.stringify(data.cell), data.cellId];
  
    try {
      await queryDB(query, values);
      console.log(`Celda movida actualizada en la base de datos: ${data.cellId}`);
    } catch (err) {
      console.error('Error actualizando la celda:', err);
    }
  
    io.to(data.workspaceId).emit('cellMoved', data);
  });
  
  socket.on('cellResized', async (data) => {
    console.log('Server received cellResized:', data);
  
    const query = `UPDATE testvariamos.cells SET data = $1 WHERE id = $2`;
    const values = [JSON.stringify(data.cell), data.cellId];
  
    try {
      await queryDB(query, values);
      console.log(`Celda redimensionada actualizada en la base de datos: ${data.cellId}`);
    } catch (err) {
      console.error('Error actualizando la celda:', err);
    }
  
    io.to(data.workspaceId).emit('cellResized', data);
  });
  

  socket.on('cellAdded', async (data) => {
    console.log('Server received cellAdded:', data);
  
    // Verificar que `data.cells` sea un array y que cada celda tenga los atributos necesarios
    if (Array.isArray(data.cells)) {
        for (const cell of data.cells) {
            if (!cell.id || !cell.type || !data.modelId || !data.projectId || !data.productLineId) {
                console.error('Missing necessary attributes for cell:', cell);
                continue;  // Saltar si faltan atributos clave
            }
            
            // Crear el objeto `cellData` con los atributos mínimos requeridos
            const cellData = {
                id: cell.id,
                type: cell.type,
                x: cell.x,
                y: cell.y,
                width: cell.width,
                height: cell.height,
                label: cell.label || '',
                style: cell.style || '',
                properties: cell.properties || []
            };

            const query = `
                INSERT INTO testvariamos.cells (id, model_id, project_id, product_line_id, data)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (id) DO UPDATE
                SET data = EXCLUDED.data
            `;
            const values = [cell.id, data.modelId, data.projectId, data.productLineId, JSON.stringify(cellData)];

            try {
                await queryDB(query, values);
                console.log(`Cell ${cell.id} has been saved/updated in the database`);
            } catch (err) {
                console.error('Error saving cell data in the database:', err);
            }
        }
    } else {
        console.error('No cells received in the correct format');
    }

    // Emitir el evento a todos los usuarios del workspace
    io.to(data.workspaceId).emit('cellAdded', data);
    console.log(`Emitting cellAdded to all clients in workspace ${data.workspaceId}`);
});
  
  socket.on('cellRemoved', async (data) => {
    console.log('Server received cellRemoved:', data);

    // Asegurarse de que se ha recibido una lista de celdas para eliminar
    if (data.cellIds && data.cellIds.length > 0) {
        for (const cellId of data.cellIds) {
            const query = `DELETE FROM testvariamos.cells WHERE id = $1`;
            const values = [cellId];

            try {
                await queryDB(query, values);
                console.log(`Celda eliminada de la base de datos: ${cellId}`);
            } catch (err) {
                console.error(`Error eliminando la celda con ID ${cellId}:`, err);
            }
        }
    } else {
        console.log('No se encontraron celdas para eliminar');
    }

    // Emitir el evento de eliminación de celdas a los demás clientes del workspace
    io.to(data.workspaceId).emit('cellRemoved', data);
});


  socket.on('cellConnected', async (data) => {
    console.log('Server received cellConnected:', data);
  
    const query = `INSERT INTO testvariamos.connections(id, source_id, target_id, model_id, project_id, product_line_id, workspace_id)
                   VALUES($1, $2, $3, $4, $5, $6, $7)`;
    const values = [uuidv4(), data.sourceId, data.targetId, data.modelId, data.projectId, data.productLineId, data.workspaceId];
  
    try {
      await queryDB(query, values);
      console.log(`Conexión guardada en la base de datos: ${data.sourceId} -> ${data.targetId}`);
    } catch (err) {
      console.error('Error guardando la conexión:', err);
    }
  
    io.to(data.workspaceId).emit('cellConnected', data);
  });

  socket.on('propertiesChanged', async (data) => {
    console.log('Server received propertiesChanged:', data);
  
    // Emitir el cambio a los demás usuarios del workspace inmediatamente, sin esperar a la base de datos
    io.to(data.workspaceId).emit('propertiesChanged', data);
  
    // Intentar realizar la actualización en la base de datos
    try {
      const queryGetCell = `SELECT data FROM testvariamos.cells WHERE id = $1`;
      const valuesGetCell = [data.cellId];
      
      const cellResult = await queryDB(queryGetCell, valuesGetCell);
  
      if (cellResult.rows.length > 0) {
        let cellData = JSON.parse(cellResult.rows[0].data);
  
        // Actualizar o eliminar propiedades en `cellData`
        data.properties.forEach(prop => {
          if (prop.deleted) {
            cellData.properties = cellData.properties.filter(p => p.name !== prop.name);
          } else {
            const existingPropIndex = cellData.properties.findIndex(p => p.name === prop.name);
            if (existingPropIndex !== -1) {
              cellData.properties[existingPropIndex].value = prop.value;
            } else {
              cellData.properties.push(prop);
            }
          }
        });
  
        const queryUpdateCell = `UPDATE testvariamos.cells SET data = $1 WHERE id = $2`;
        const valuesUpdateCell = [JSON.stringify(cellData), data.cellId];
  
        try {
          await queryDB(queryUpdateCell, valuesUpdateCell);
          console.log(`Propiedades de la celda actualizadas en la base de datos: ${data.cellId}`);
        } catch (err) {
          console.error('Error actualizando las propiedades de la celda:', err);
        }
      } else {
        console.log('Celda no encontrada en la base de datos para actualizar las propiedades.');
      }
    } catch (err) {
      console.error('Error obteniendo la celda para actualizar las propiedades:', err);
    }
  });
  
  socket.on('cursorMoved', (data) => {
    io.to(data.workspaceId).emit('cursorMoved', data);
  });

  socket.on('edgeStyleChanged', async (data) => {
    console.log('Server received edgeStyleChanged:', data);
  
    const query = `UPDATE testvariamos.edges SET style = $1 WHERE id = $2`;
    const values = [JSON.stringify(data.newStyle), data.edgeId];
  
    try {
      await queryDB(query, values);
      console.log(`Estilo del borde actualizado en la base de datos: ${data.edgeId}`);
    } catch (err) {
      console.error('Error actualizando el estilo del borde:', err);
    }
  
    io.to(data.workspaceId).emit('edgeStyleChanged', data);
  });
  
  socket.on('edgeLabelChanged', async (data) => {
    console.log('Server received edgeLabelChanged:', data);
  
    // Validar que label y edgeId no sean undefined
    if (!data.label || !data.cellId) {
      console.error('Etiqueta o ID del borde no proporcionados. No se puede actualizar.');
      return;
    }
  
    const query = `UPDATE testvariamos.edges SET label = $1 WHERE id = $2`;
    const values = [data.label, data.cellId];
  
    try {
      await queryDB(query, values);
      console.log(`Etiqueta del borde actualizada en la base de datos. Edge ID: ${data.cellId}, Nueva etiqueta: ${data.label}`);
    } catch (err) {
      console.error('Error actualizando la etiqueta del borde:', err);
    }
  
    // Emitir el cambio a los demás usuarios del workspace
    io.to(data.workspaceId).emit('edgeLabelChanged', data);
  });
  
  
  // Al desconectarse, eliminar el usuario del workspace correspondiente
  socket.on('disconnect', () => {
    // Eliminar el usuario del mapa de usuarios conectados cuando se desconecta
    for (const email in connectedUsers) {
      if (connectedUsers[email] === socket.id) {
        delete connectedUsers[email];
        break;
      }
    }
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = 4000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
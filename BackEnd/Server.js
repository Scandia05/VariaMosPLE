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
    origin: "http://ceis.variamos.com:3000",
    methods: ["GET", "POST"]
  }
});

const pool = new Pool({
  user: 'adminpg',
  host: '200.13.4.230',
  database: 'variamos_nuevo',
  password: 'seba2424',
  port: 5432,
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
      INSERT INTO variamos.user (id, "user", name, email, socket_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email)
      DO UPDATE SET socket_id = EXCLUDED.socket_id, name = EXCLUDED.name
    `;
    const values = [uuidv4(), userData.user || '', userData.name || '', userData.email, socket.id]; // Asegúrate de que todos los valores están presentes
  
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
    const query = `INSERT INTO variamos.workspace_users (workspace_id, client_id, socket_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`;
    const values = [workspaceId, clientId, socket.id];
  
    try {
      await queryDB(query, values);
      console.log(`Client ${clientId} added to workspace ${workspaceId} in the database`);
    } catch (err) {
      console.error('Error saving workspace join in the database:', err);
    }
  
    // Verificar si el proyecto por defecto "My Project" ya existe en el workspace
    const checkProjectQuery = `SELECT * FROM variamos.project WHERE workspace_id = $1 AND project->>'name' = $2`;
    const projectValues = [workspaceId, 'My project'];
  
    try {
      const projectResult = await queryDB(checkProjectQuery, projectValues);
  
      if (projectResult.rowCount === 0) {
        // Si no existe, crear el proyecto "My Project"
        const projectId = uuidv4();
        const projectData = {
          id: projectId,
          name: 'My project',
          enable: true,
          productLines: [] // Puedes ajustar según lo que necesites en la estructura del proyecto
        };
        
        const insertProjectQuery = `INSERT INTO variamos.project (id, project, workspace_id) VALUES ($1, $2, $3)`;
        const insertProjectValues = [projectId, JSON.stringify(projectData), workspaceId];
        
        try {
          await queryDB(insertProjectQuery, insertProjectValues);
          console.log(`Project "My Project" created for workspace ${workspaceId}`);
  
          // Validar si el proyecto se creó correctamente
          const validationQuery = `SELECT * FROM variamos.project WHERE id = $1`;
          const validationResult = await queryDB(validationQuery, [projectId]);
          
          if (validationResult.rowCount === 0) {
            console.error(`Project ${projectId} was not found after creation.`);
          } else {
            console.log(`Project ${projectId} was successfully created and validated.`);
          }
  
          // Emitir el evento de creación del proyecto al usuario que se unió
          io.to(socket.id).emit('projectCreated', {
            clientId,
            workspaceId,
            project: projectData
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
          project: projectResult.rows[0].project // Emitimos el proyecto existente desde el campo 'project'
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

    // Crear el JSON del proyecto para almacenarlo en la base de datos
    const projectJson = {
        id: data.project.id,
        name: data.project.name,
        enable: false,
        productLines: [],  // Inicialmente vacío
        languagesAllowed: [],
        applicationEngineering: {
            models: [],
            languagesAllowed: [],
            applications: []
        }
    };

    // Actualizar el JSON para que también contenga el workspaceId
    const query = `INSERT INTO variamos.project(id, project, workspace_id) VALUES($1, $2, $3)`;
    const values = [data.project.id, JSON.stringify(projectJson), data.workspaceId];  // Incluir el workspaceId aquí

    try {
        await queryDB(query, values);
        console.log(`Proyecto guardado en la base de datos: ${data.project.name}`);
    } catch (err) {
        console.error('Error guardando el proyecto en la base de datos:', err);
    }

    // Emitir el evento de creación de proyecto a todos los usuarios del workspace
    io.to(data.workspaceId).emit('projectCreated', data);
});

// Manejar la creación de productLines
socket.on('productLineCreated', async (data) => {
  console.log('Server received productLineCreated:', data);

  // Consultar el proyecto existente en la base de datos
  const selectProjectQuery = `SELECT project FROM variamos.project WHERE id = $1`;
  const projectValues = [data.projectId];

  try {
      const projectResult = await queryDB(selectProjectQuery, projectValues);
      
      if (projectResult.rows.length > 0) {
          let projectJson = projectResult.rows[0].project;
          
          // Agregar la nueva product line al JSON del proyecto
          const newProductLine = {
              id: data.productLine.id,
              name: data.productLine.name,
              type: data.productLine.type,
              domain: data.productLine.domain,
              domainEngineering: {
                  models: [],
                  relationships: [],
                  constraints: ""
              }
          };
          
          projectJson.productLines.push(newProductLine);

          // Guardar el JSON actualizado en la base de datos
          const updateProjectQuery = `UPDATE variamos.project SET project = $1 WHERE id = $2`;
          const updateValues = [JSON.stringify(projectJson), data.projectId];

          await queryDB(updateProjectQuery, updateValues);
          console.log(`ProductLine guardada en el proyecto: ${data.productLine.name}`);
      } else {
          console.error('Error: Proyecto no encontrado para actualizar la ProductLine.');
      }

  } catch (err) {
      console.error('Error guardando la ProductLine en la base de datos:', err);
  }
            // Emitir el evento de creación de ProductLine a todos los usuarios del workspace
            io.to(data.workspaceId).emit('productLineCreated', data);
});

  // Emitir eventos solo a los usuarios del mismo workspace
  socket.on('modelCreated', async (data) => {
    console.log('Server received modelCreated:', data);

    const selectProjectQuery = `SELECT project FROM variamos.project WHERE id = $1`;
    const projectValues = [data.projectId];

    try {
        const projectResult = await queryDB(selectProjectQuery, projectValues);

        if (projectResult.rows.length > 0) {
            let projectJson = projectResult.rows[0].project;

            // Verificar que la productLine esté presente en el proyecto
            const productLine = projectJson.productLines.find(pl => pl.id === data.productLineId);
            if (!productLine) {
                console.error('Error: ProductLine no encontrada en el proyecto para agregar el modelo.');
                return;
            }

            // Crear el nuevo modelo a ser añadido a la productLine
            const newModel = {
                id: data.model.id,
                name: data.model.name,
                type: data.model.type,
                inconsistent: false,
                consistencyError: null,
                elements: [],
                relationships: [],
                constraints: "",
                sourceModelIds: [] // Puedes agregar otros atributos según sea necesario
            };

            // Agregar el nuevo modelo a domainEngineering.models de la productLine
            productLine.domainEngineering.models.push(newModel);

            // Actualizar el proyecto en la base de datos
            const updateProjectQuery = `UPDATE variamos.project SET project = $1 WHERE id = $2`;
            const updateValues = [JSON.stringify(projectJson), data.projectId];

            await queryDB(updateProjectQuery, updateValues);
            console.log(`Modelo ${data.model.name} guardado en el proyecto ${data.projectId}`);
        } else {
            console.error('Error: Proyecto no encontrado para agregar el modelo.');
        }

    } catch (err) {
        console.error('Error guardando el modelo en el proyecto:', err);
    }

    // Emitir el evento de creación de modelo a todos los usuarios del workspace
    io.to(data.workspaceId).emit('modelCreated', data);
});

  
  // Manejar la eliminación de un modelo
  socket.on('modelDeleted', async (data) => {
    console.log(`Server received modelDeleted:`, data);

    const selectProjectQuery = `SELECT project FROM variamos.project WHERE id = $1`;
    const projectValues = [data.projectId];

    try {
        const projectResult = await queryDB(selectProjectQuery, projectValues);

        if (projectResult.rows.length > 0) {
            let projectJson = projectResult.rows[0].project;

            // Encontrar la product line correspondiente
            let productLine = projectJson.productLines.find(pl => pl.id === data.productLineId);
            if (productLine) {
                // Eliminar el modelo correspondiente
                productLine.domainEngineering.models = productLine.domainEngineering.models.filter(m => m.id !== data.modelId);

                // Guardar el JSON actualizado en la base de datos
                const updateProjectQuery = `UPDATE variamos.project SET project = $1 WHERE id = $2`;
                const updateValues = [JSON.stringify(projectJson), data.projectId];

                await queryDB(updateProjectQuery, updateValues);
                console.log(`Modelo eliminado del proyecto: ${data.modelId}`);
            } else {
                console.error('ProductLine no encontrada para eliminar el modelo.');
            }
        } else {
            console.error('Error: Proyecto no encontrado para eliminar el modelo.');
        }

    } catch (err) {
        console.error('Error eliminando el modelo en el proyecto:', err);
    }
    
  // Emitir el evento de eliminación del modelo a todos los usuarios del workspace
  io.to(data.workspaceId).emit('modelDeleted', data);
});
  
  // Manejar el renombramiento de un modelo
  socket.on('modelRenamed', async (data) => {
    console.log(`Server received modelRenamed:`, data);

    const selectProjectQuery = `SELECT project FROM variamos.project WHERE id = $1`;
    const projectValues = [data.projectId];

    try {
        const projectResult = await queryDB(selectProjectQuery, projectValues);

        if (projectResult.rows.length > 0) {
            let projectJson = projectResult.rows[0].project;

            // Encontrar la product line y el modelo correspondientes
            let productLine = projectJson.productLines.find(pl => pl.id === data.productLineId);
            if (productLine) {
                let model = productLine.domainEngineering.models.find(m => m.id === data.modelId);
                if (model) {
                    // Renombrar el modelo
                    model.name = data.newName;

                    // Guardar el JSON actualizado en la base de datos
                    const updateProjectQuery = `UPDATE variamos.project SET project = $1 WHERE id = $2`;
                    const updateValues = [JSON.stringify(projectJson), data.projectId];

                    await queryDB(updateProjectQuery, updateValues);
                    console.log(`Nombre del modelo actualizado en el proyecto: ${data.modelId}`);
                } else {
                    console.error('Modelo no encontrado para renombrar.');
                }
            } else {
                console.error('ProductLine no encontrada para renombrar el modelo.');
            }
        } else {
            console.error('Error: Proyecto no encontrado para renombrar el modelo.');
        }

    } catch (err) {
        console.error('Error renombrando el modelo en el proyecto:', err);
    }
    io.to(data.workspaceId).emit('modelRenamed', data);
});
  
  // Manejar la configuración de un modelo
  socket.on('modelConfigured', async (data) => {
    console.log(`Server received modelConfigured:`, data);

    const selectProjectQuery = `SELECT project FROM variamos.project WHERE id = $1`;
    const projectValues = [data.projectId];

    try {
        const projectResult = await queryDB(selectProjectQuery, projectValues);

        if (projectResult.rows.length > 0) {
            let projectJson = projectResult.rows[0].project;

            // Encontrar la product line y el modelo correspondientes
            let productLine = projectJson.productLines.find(pl => pl.id === data.productLineId);
            if (productLine) {
                let model = productLine.domainEngineering.models.find(m => m.id === data.modelId);
                if (model) {
                    // Actualizar la configuración del modelo
                    model.configuration = data.configuration;

                    // Guardar el JSON actualizado en la base de datos
                    const updateProjectQuery = `UPDATE variamos.project SET project = $1 WHERE id = $2`;
                    const updateValues = [JSON.stringify(projectJson), data.projectId];

                    await queryDB(updateProjectQuery, updateValues);
                    console.log(`Configuración del modelo actualizada en el proyecto: ${data.modelId}`);

                    // Emitir el evento de configuración a todos los usuarios del workspace

                } else {
                    console.error('Modelo no encontrado para configurar.');
                }
            } else {
                console.error('ProductLine no encontrada para configurar el modelo.');
            }
        } else {
            console.error('Error: Proyecto no encontrado para configurar el modelo.');
        }

    } catch (err) {
        console.error('Error configurando el modelo en el proyecto:', err);
    }
    io.to(data.workspaceId).emit('modelConfigured', data);
});
  
socket.on('cellMoved', async (data) => {
  console.log('Server received cellMoved:', data);

  const selectProjectQuery = `SELECT project FROM variamos.project WHERE id = $1`;
  const projectValues = [data.projectId];

  try {
      const projectResult = await queryDB(selectProjectQuery, projectValues);

      if (projectResult.rows.length > 0) {
          let projectJson = projectResult.rows[0].project;

          // Encontrar la product line y el modelo correspondientes
          let productLine = projectJson.productLines.find(pl => pl.id === data.productLineId);
          if (productLine) {
              let model = productLine.domainEngineering.models.find(m => m.id === data.modelId);
              if (model) {
                  // Encontrar y mover la celda correspondiente
                  let cell = model.elements.find(c => c.id === data.cellId);
                  if (cell) {
                      cell.x = data.cell.x;
                      cell.y = data.cell.y;

                      // Guardar el JSON actualizado en la base de datos
                      const updateProjectQuery = `UPDATE variamos.project SET project = $1 WHERE id = $2`;
                      const updateValues = [JSON.stringify(projectJson), data.projectId];

                      await queryDB(updateProjectQuery, updateValues);
                      console.log(`Celda movida actualizada en el proyecto: ${data.cellId}`);

                      // Emitir el evento de movimiento a todos los usuarios del workspace
                  } else {
                      console.error('Celda no encontrada para mover.');
                  }
              } else {
                  console.error('Modelo no encontrado para mover la celda.');
              }
          } else {
              console.error('ProductLine no encontrada para mover la celda.');
          }
      } else {
          console.error('Error: Proyecto no encontrado para mover la celda.');
      }

  } catch (err) {
      console.error('Error moviendo la celda en el proyecto:', err);
  }
  io.to(data.workspaceId).emit('cellMoved', data);
});
  
socket.on('cellResized', async (data) => {
  console.log('Server received cellResized:', data);

  const selectProjectQuery = `SELECT project FROM variamos.project WHERE id = $1`;
  const projectValues = [data.projectId];

  try {
      const projectResult = await queryDB(selectProjectQuery, projectValues);

      if (projectResult.rows.length > 0) {
          let projectJson = projectResult.rows[0].project;

          // Encontrar la product line y el modelo correspondientes
          let productLine = projectJson.productLines.find(pl => pl.id === data.productLineId);
          if (productLine) {
              let model = productLine.domainEngineering.models.find(m => m.id === data.modelId);
              if (model) {
                  // Encontrar y redimensionar la celda correspondiente
                  let cell = model.elements.find(c => c.id === data.cellId);
                  if (cell) {
                      cell.width = data.cell.width;
                      cell.height = data.cell.height;

                      // Guardar el JSON actualizado en la base de datos
                      const updateProjectQuery = `UPDATE variamos.project SET project = $1 WHERE id = $2`;
                      const updateValues = [JSON.stringify(projectJson), data.projectId];

                      await queryDB(updateProjectQuery, updateValues);
                      console.log(`Celda redimensionada actualizada en el proyecto: ${data.cellId}`);

                      // Emitir el evento de redimensionamiento a todos los usuarios del workspace
                  } else {
                      console.error('Celda no encontrada para redimensionar.');
                  }
              } else {
                  console.error('Modelo no encontrado para redimensionar la celda.');
              }
          } else {
              console.error('ProductLine no encontrada para redimensionar la celda.');
          }
      } else {
          console.error('Error: Proyecto no encontrado para redimensionar la celda.');
      }

  } catch (err) {
      console.error('Error redimensionando la celda en el proyecto:', err);
  }
  io.to(data.workspaceId).emit('cellResized', data);
});

  socket.on('cellAdded', async (data) => {
    console.log('Server received cellAdded:', data);

    const selectProjectQuery = `SELECT project FROM variamos.project WHERE id = $1`;
    const projectValues = [data.projectId];

    try {
        const projectResult = await queryDB(selectProjectQuery, projectValues);

        if (projectResult.rows.length > 0) {
            let projectJson = projectResult.rows[0].project;

            // Encontrar la productLine y el modelo correspondientes
            let productLine = projectJson.productLines.find(pl => pl.id === data.productLineId);
            if (productLine) {
                let model = productLine.domainEngineering.models.find(m => m.id === data.modelId);
                if (model) {
                    // Agregar las nuevas celdas al modelo
                    data.cells.forEach(cell => {
                        const newCell = {
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
                        model.elements.push(newCell);
                    });

                    // Guardar el JSON actualizado en la base de datos
                    const updateProjectQuery = `UPDATE variamos.project SET project = $1 WHERE id = $2`;
                    const updateValues = [JSON.stringify(projectJson), data.projectId];

                    await queryDB(updateProjectQuery, updateValues);
                    console.log(`Celdas guardadas en el modelo: ${data.modelId}`);

                    // Emitir el evento de celdas añadidas a todos los usuarios del workspace
                } else {
                    console.error('Modelo no encontrado para agregar las celdas.');
                }
            } else {
                console.error('ProductLine no encontrada para agregar las celdas.');
            }
        } else {
            console.error('Error: Proyecto no encontrado para agregar las celdas.');
        }

    } catch (err) {
        console.error('Error guardando las celdas en el proyecto:', err);
    }
    io.to(data.workspaceId).emit('cellAdded', data);
});

socket.on('cellRemoved', async (data) => {
  console.log('Server received cellRemoved:', data);

  const selectProjectQuery = `SELECT project FROM variamos.project WHERE id = $1`;
  const projectValues = [data.projectId];

  try {
      const projectResult = await queryDB(selectProjectQuery, projectValues);

      if (projectResult.rows.length > 0) {
          let projectJson = projectResult.rows[0].project;

          // Encontrar la product line y el modelo correspondientes
          let productLine = projectJson.productLines.find(pl => pl.id === data.productLineId);
          if (productLine) {
              let model = productLine.domainEngineering.models.find(m => m.id === data.modelId);
              if (model) {
                  // Eliminar las celdas correspondientes
                  model.elements = model.elements.filter(c => !data.cellIds.includes(c.id));

                  // Guardar el JSON actualizado en la base de datos
                  const updateProjectQuery = `UPDATE variamos.project SET project = $1 WHERE id = $2`;
                  const updateValues = [JSON.stringify(projectJson), data.projectId];

                  await queryDB(updateProjectQuery, updateValues);
                  console.log(`Celdas eliminadas del modelo: ${data.cellIds.join(', ')}`);

                  // Emitir el evento de eliminación de celdas a todos los usuarios del workspace
              } else {
                  console.error('Modelo no encontrado para eliminar celdas.');
              }
          } else {
              console.error('ProductLine no encontrada para eliminar celdas.');
          }
      } else {
          console.error('Error: Proyecto no encontrado para eliminar celdas.');
      }

  } catch (err) {
      console.error('Error eliminando celdas en el proyecto:', err);
  }
  io.to(data.workspaceId).emit('cellRemoved', data);
});

socket.on('cellConnected', async (data) => {
  console.log('Server received cellConnected:', data);

  const selectProjectQuery = `SELECT project FROM variamos.project WHERE id = $1`;
  const projectValues = [data.projectId];

  try {
      const projectResult = await queryDB(selectProjectQuery, projectValues);

      if (projectResult.rows.length > 0) {
          let projectJson = projectResult.rows[0].project;

          // Encontrar la product line y el modelo correspondientes
          let productLine = projectJson.productLines.find(pl => pl.id === data.productLineId);
          if (productLine) {
              let model = productLine.domainEngineering.models.find(m => m.id === data.modelId);
              if (model) {
                  // Añadir la nueva conexión
                  const newConnection = {
                      id: uuidv4(),
                      sourceId: data.sourceId,
                      targetId: data.targetId,
                      properties: data.properties || [],
                  };

                  model.relationships.push(newConnection);

                  // Guardar el JSON actualizado en la base de datos
                  const updateProjectQuery = `UPDATE variamos.project SET project = $1 WHERE id = $2`;
                  const updateValues = [JSON.stringify(projectJson), data.projectId];

                  await queryDB(updateProjectQuery, updateValues);
                  console.log(`Conexión guardada en el modelo: ${data.sourceId} -> ${data.targetId}`);

                  // Emitir el evento de conexión a todos los usuarios del workspace
              } else {
                  console.error('Modelo no encontrado para agregar la conexión.');
              }
          } else {
              console.error('ProductLine no encontrada para agregar la conexión.');
          }
      } else {
          console.error('Error: Proyecto no encontrado para agregar la conexión.');
      }

  } catch (err) {
      console.error('Error guardando la conexión en el proyecto:', err);
  }
  io.to(data.workspaceId).emit('cellConnected', data);
});

socket.on('propertiesChanged', async (data) => {
  console.log('Server received propertiesChanged:', data);

  const selectProjectQuery = `SELECT project FROM variamos.project WHERE id = $1`;
  const projectValues = [data.projectId];

  try {
      const projectResult = await queryDB(selectProjectQuery, projectValues);

      if (projectResult.rows.length > 0) {
          let projectJson = projectResult.rows[0].project;

          // Encontrar la product line y el modelo correspondientes
          let productLine = projectJson.productLines.find(pl => pl.id === data.productLineId);
          if (productLine) {
              let model = productLine.domainEngineering.models.find(m => m.id === data.modelId);
              if (model) {
                  // Encontrar la celda y actualizar sus propiedades
                  let cell = model.elements.find(c => c.id === data.cellId);
                  if (cell) {
                      data.properties.forEach(prop => {
                          const existingProp = cell.properties.find(p => p.name === prop.name);
                          if (existingProp) {
                              existingProp.value = prop.value;
                          } else {
                              cell.properties.push(prop);
                          }
                      });

                      // Guardar el JSON actualizado en la base de datos
                      const updateProjectQuery = `UPDATE variamos.project SET project = $1 WHERE id = $2`;
                      const updateValues = [JSON.stringify(projectJson), data.projectId];

                      await queryDB(updateProjectQuery, updateValues);
                      console.log(`Propiedades de la celda actualizadas en el proyecto: ${data.cellId}`);

                      // Emitir el evento de cambio de propiedades a todos los usuarios del workspace
                  } else {
                      console.error('Celda no encontrada para cambiar propiedades.');
                  }
              } else {
                  console.error('Modelo no encontrado para cambiar propiedades de la celda.');
              }
          } else {
              console.error('ProductLine no encontrada para cambiar propiedades de la celda.');
          }
      } else {
          console.error('Error: Proyecto no encontrado para cambiar propiedades de la celda.');
      }

  } catch (err) {
      console.error('Error cambiando propiedades de la celda en el proyecto:', err);
  }
  io.to(data.workspaceId).emit('propertiesChanged', data);
});
  
  socket.on('cursorMoved', (data) => {
    io.to(data.workspaceId).emit('cursorMoved', data);
  });

  socket.on('edgeStyleChanged', async (data) => {
    console.log('Server received edgeStyleChanged:', data);

    const selectProjectQuery = `SELECT project FROM variamos.project WHERE id = $1`;
    const projectValues = [data.projectId];

    try {
        const projectResult = await queryDB(selectProjectQuery, projectValues);

        if (projectResult.rows.length > 0) {
            let projectJson = projectResult.rows[0].project;

            // Encontrar la product line y el modelo correspondientes
            let productLine = projectJson.productLines.find(pl => pl.id === data.productLineId);
            if (productLine) {
                let model = productLine.domainEngineering.models.find(m => m.id === data.modelId);
                if (model) {
                    // Encontrar la relación y cambiar su estilo
                    let edge = model.relationships.find(r => r.id === data.edgeId);
                    if (edge) {
                        edge.style = data.newStyle;

                        // Guardar el JSON actualizado en la base de datos
                        const updateProjectQuery = `UPDATE variamos.project SET project = $1 WHERE id = $2`;
                        const updateValues = [JSON.stringify(projectJson), data.projectId];

                        await queryDB(updateProjectQuery, updateValues);
                        console.log(`Estilo del borde actualizado en el proyecto: ${data.edgeId}`);

                        // Emitir el evento de cambio de estilo a todos los usuarios del workspace
                    } else {
                        console.error('Borde no encontrado para cambiar estilo.');
                    }
                } else {
                    console.error('Modelo no encontrado para cambiar estilo del borde.');
                }
            } else {
                console.error('ProductLine no encontrada para cambiar estilo del borde.');
            }
        } else {
            console.error('Error: Proyecto no encontrado para cambiar estilo del borde.');
        }

    } catch (err) {
        console.error('Error cambiando estilo del borde en el proyecto:', err);
    }
    io.to(data.workspaceId).emit('edgeStyleChanged', data);
});
  
socket.on('edgeLabelChanged', async (data) => {
  console.log('Server received edgeLabelChanged:', data);

  const selectProjectQuery = `SELECT project FROM variamos.project WHERE id = $1`;
  const projectValues = [data.projectId];

  try {
      const projectResult = await queryDB(selectProjectQuery, projectValues);

      if (projectResult.rows.length > 0) {
          let projectJson = projectResult.rows[0].project;

          // Encontrar la product line y el modelo correspondientes
          let productLine = projectJson.productLines.find(pl => pl.id === data.productLineId);
          if (productLine) {
              let model = productLine.domainEngineering.models.find(m => m.id === data.modelId);
              if (model) {
                  // Encontrar la relación y cambiar su etiqueta
                  let edge = model.relationships.find(r => r.id === data.edgeId);
                  if (edge) {
                      edge.label = data.label;

                      // Guardar el JSON actualizado en la base de datos
                      const updateProjectQuery = `UPDATE variamos.project SET project = $1 WHERE id = $2`;
                      const updateValues = [JSON.stringify(projectJson), data.projectId];

                      await queryDB(updateProjectQuery, updateValues);
                      console.log(`Etiqueta del borde actualizada en el proyecto: ${data.edgeId}`);

                      // Emitir el evento de cambio de etiqueta a todos los usuarios del workspace
                  } else {
                      console.error('Borde no encontrado para cambiar etiqueta.');
                  }
              } else {
                  console.error('Modelo no encontrado para cambiar etiqueta del borde.');
              }
          } else {
              console.error('ProductLine no encontrada para cambiar etiqueta del borde.');
          }
      } else {
          console.error('Error: Proyecto no encontrado para cambiar etiqueta del borde.');
      }

  } catch (err) {
      console.error('Error cambiando etiqueta del borde en el proyecto:', err);
  }
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
import React, { Component } from "react";
import "./MxGEditor.css";

import mx from "./mxgraph";
import { mxGraph } from "mxgraph";
import ProjectService from "../../Application/Project/ProjectService";
import { Model } from "../../Domain/ProductLineEngineering/Entities/Model";
import { Property } from "../../Domain/ProductLineEngineering/Entities/Property";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Relationship } from "../../Domain/ProductLineEngineering/Entities/Relationship";
import { Point } from "../../Domain/ProductLineEngineering/Entities/Point";
import MxgraphUtils from "../../Infraestructure/Mxgraph/MxgraphUtils";
import { isLabeledStatement } from "typescript";
import SuggestionInput from "../SuggestionInput/SuggestionInput";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import Dropdown from 'react-bootstrap/Dropdown';
// import {Element}   from "../../Domain/ProductLineEngineering/Entities/Element";
import MxProperties from "../MxProperties/MxProperties";
import * as alertify from "alertifyjs";
import { RiSave3Fill } from "react-icons/ri";
import { FaRegFolderOpen } from "react-icons/fa6";
import { ImZoomIn } from "react-icons/im";
import { ImZoomOut } from "react-icons/im";
import { BsFillPencilFill } from "react-icons/bs";
import { FaBolt } from "react-icons/fa";
import { IoMdAlert } from "react-icons/io";
import socket from "../../Utils/Socket";
import { SignUpKeys } from '../SignUp/SignUp.constants';

interface Props {
  projectService: ProjectService;
}
interface State {
  showConstraintModal: boolean;
  currentModelConstraints: string;
  showContextMenuElement: boolean;
  contextMenuX: number;
  contextMenuY: number;
  showPropertiesModal: boolean;
  showMessageModal: boolean;
  selectedObject: any;
  messageModalContent: string;
  messageModalTitle: string;
  showInviteModal: boolean;
  inviteData: any;
}

export default class MxGEditor extends Component<Props, State> {
  //state = {};
  containerRef: any;
  graphContainerRef: any;
  graph?: mxGraph;
  currentModel?: Model;
  private socket = socket;
  private clientId: string;
  private isLocalChange: boolean = false;
  private user: string;
  private userName: string;
  private workspaceId: string;

  constructor(props: Props) {
    super(props);
    this.containerRef = React.createRef();
    this.graphContainerRef = React.createRef();
    this.state = {
      showPropertiesModal: false,
      showMessageModal: false,
      showConstraintModal: false,
      currentModelConstraints: "",
      showContextMenuElement: false,
      contextMenuX: 0,
      contextMenuY: 0,
      selectedObject: null,
      messageModalContent: null,
      messageModalTitle: null,
      showInviteModal: false, // Estado para el modal de invitación
      inviteData: null
    }

    const userProfile = JSON.parse(sessionStorage.getItem(SignUpKeys.CurrentUserProfile) || localStorage.getItem(SignUpKeys.CurrentUserProfile));
    this.clientId = this.props.projectService.getClientId();
    this.workspaceId = this.props.projectService.getWorkspaceId();
    console.log("MxGEditor initialized with workspaceId:", this.workspaceId);
    this.user = userProfile ? userProfile.givenName : this.clientId; // Asigna el nombre del usuario o el clientId si no está disponible
    this.userName = userProfile ? userProfile.email : this.clientId;

    this.projectService_addNewProductLineListener = this.projectService_addNewProductLineListener.bind(this);
    this.projectService_addSelectedModelListener = this.projectService_addSelectedModelListener.bind(this);
    this.projectService_addCreatedElementListener = this.projectService_addCreatedElementListener.bind(this);
    this.projectService_addUpdatedElementListener = this.projectService_addUpdatedElementListener.bind(this);
    this.projectService_addUpdateProjectListener = this.projectService_addUpdateProjectListener.bind(this);
    //handle constraints modal
    this.showConstraintModal = this.showConstraintModal.bind(this);
    this.hideConstraintModal = this.hideConstraintModal.bind(this);
    this.saveConstraints = this.saveConstraints.bind(this);
    //handle properties modal
    this.showPropertiesModal = this.showPropertiesModal.bind(this);
    this.hidePropertiesModal = this.hidePropertiesModal.bind(this);
    this.savePropertiesModal = this.savePropertiesModal.bind(this);
    this.hideMessageModal = this.hideMessageModal.bind(this);
  }

  projectService_addNewProductLineListener(e: any) {
    this.forceUpdate();
  }

  projectService_addSelectedModelListener(e: any) {
    this.loadModel(e.model);
    this.forceUpdate();
  }

  projectService_addCreatedElementListener(e: any) {
    let me = this;
    let vertice = MxgraphUtils.findVerticeById(this.graph, e.element.id, null);
    if (vertice) {
      me.setState({
        selectedObject: e.element
      })
      let fun = function () {
        me.setState({
          selectedObject: e.element,
          showPropertiesModal: true
        })
      }
      setTimeout(fun, 500);
    } else {
      let edge = MxgraphUtils.findEdgeById(this.graph, e.element.id, null);
      if (edge) {
        // this.refreshEdgeLabel(edge);
        // this.refreshEdgeStyle(edge);
      }
    }
  }

  projectService_addUpdatedElementListener(e: any) {
    try {
      let vertice = MxgraphUtils.findVerticeById(this.graph, e.element.id, null);
      if (vertice) {
        this.refreshVertexLabel(vertice);
        this.createOverlays(e.element, vertice);
      } else {
        let edge = MxgraphUtils.findEdgeById(this.graph, e.element.id, null);
        if (edge) {
          this.refreshEdgeLabel(edge);
          this.refreshEdgeStyle(edge);
        }
      }
      this.graph.refresh();
    } catch (error) {
      let m = error;
    }
  }

  projectService_addUpdateProjectListener(e: any) {
    let me = this;
    let model = me.props.projectService.findModelById(e.project, e.modelSelectedId);
    me.loadModel(model);
    me.forceUpdate();
  }

  componentDidMount() {
    let me = this;
    this.graph = new mx.mxGraph(this.graphContainerRef.current);
    this.props.projectService.setGraph(this.graph);
    this.LoadGraph(this.graph);
    me.props.projectService.addNewProductLineListener(
      this.projectService_addNewProductLineListener
    );
    me.props.projectService.addSelectedModelListener(
      this.projectService_addSelectedModelListener
    );
    me.props.projectService.addCreatedElementListener(
      this.projectService_addCreatedElementListener
    );
    me.props.projectService.addUpdatedElementListener(
      this.projectService_addUpdatedElementListener
    );
    me.props.projectService.addUpdateProjectListener(
      this.projectService_addUpdateProjectListener
    );

    this.socket.on('workspaceJoined', (data) => {
      // Actualizar el workspaceId cuando el usuario se une a un nuevo workspace
      if (data.clientId === this.clientId) {
          console.log(`Joined new workspace: ${data.workspaceId}`);
          this.workspaceId = data.workspaceId; // Actualizar el workspaceId
      }
  });

    this.socket.emit('registerUser', { email: this.userName });

    this.graphContainerRef.current.addEventListener('mousemove', (e) => {
      if (this.clientId) {
        this.socket.emit('cursorMoved', {
          clientId: this.clientId,
          workspaceId: me.workspaceId,
          user: this.user, // Emitir el nombre del usuario
          x: e.clientX,
          y: e.clientY
        });
      }
    });

  this.socket.on('userDisconnected', (data) => {
    let cursor = document.getElementById(`cursor-${data.clientId}`);
    let cursorLabel = document.getElementById(`cursor-label-${data.clientId}`);
    if (cursor) {
        cursor.remove();
    }
    if (cursorLabel) {
        cursorLabel.remove();
    }
});

    me.socket.on('cellMoved', (data) => {
      if (data.workspaceId === me.workspaceId && data.clientId !== me.clientId) {
          me.isLocalChange = true;
          data.cells.forEach(cellData => {
              let cell = MxgraphUtils.findVerticeById(me.graph, cellData.id, null);
              if (cell) {
                  cell.geometry.x = cellData.x;
                  cell.geometry.y = cellData.y;
                  me.graph.getModel().setStyle(cell, cellData.style);
              }
          });
          me.graph.refresh();
          me.isLocalChange = false;
      }
  });

  me.socket.on('cellConnected', (data) => {
    console.log('Received cellConnected:', data);
    if (data.workspaceId === me.workspaceId && data.clientId !== me.clientId) {
        me.isLocalChange = true;
        let source = MxgraphUtils.findVerticeById(me.graph, data.sourceId, null);
        let target = MxgraphUtils.findVerticeById(me.graph, data.targetId, null);
        if (source && target) {
            let existingEdge = me.graph.getModel().getEdgesBetween(source, target, false);
            if (existingEdge.length === 0) {
                var doc = mx.mxUtils.createXmlDocument();
                var node = doc.createElement("relationship");
                node.setAttribute("uid", data.relationshipId);
                node.setAttribute("label", data.relationshipName);
                // Asigna las propiedades recibidas
                data.properties.forEach(prop => node.setAttribute(prop.name, prop.value));
                let edge = me.graph.insertEdge(me.graph.getDefaultParent(), null, node, source, target);
                me.graph.getModel().setStyle(edge, data.style);
                me.graph.refresh();
            }
        }
        me.isLocalChange = false;
    }
});

me.socket.on('cellAdded', (data) => {
  console.log('Received cellAdded:', data);
  console.log(`Server received cellAdded from client ${data.clientId} in workspace ${data.workspaceId}`);

  if (data.workspaceId === me.workspaceId && data.clientId !== me.clientId) {
    me.isLocalChange = true;

    data.cells.forEach(cellData => {
      console.log('Processing cell:', cellData);
      console.log(`socket.on(cellAdded) - Nombre/Label de la celda: ${cellData.label}`);

      // Verificar si la celda ya existe en el grafo
      let existingCell = MxgraphUtils.findVerticeById(me.graph, cellData.id, null);

      if (existingCell) {
        // Si la celda ya existe, actualizamos sus propiedades y geometría
        console.log('Cell already exists, updating properties:', cellData);
        existingCell.geometry.x = cellData.x;
        existingCell.geometry.y = cellData.y;
        existingCell.geometry.width = cellData.width;
        existingCell.geometry.height = cellData.height;

        // Actualizar el label y el estilo
        existingCell.value.setAttribute("label", cellData.label);
        me.graph.getModel().setStyle(existingCell, cellData.style);

        // Refrescar el label del vértice para asegurar la visibilidad correcta del cambio
        me.refreshVertexLabel(existingCell);

        // Actualizar los overlays (íconos) basados en las propiedades
        me.createOverlays(cellData, existingCell);

        me.graph.refresh();
      } else {
        // Si no existe, la creamos
        if (cellData.type !== 'relationship') {
          let element = me.props.projectService.findModelElementById(me.currentModel, cellData.id);
          if (!element) {
            element = {
              id: cellData.id,
              type: cellData.type,
              name: cellData.label,
              properties: [], // No asignar propiedades aquí
              x: cellData.x,
              y: cellData.y,
              width: cellData.width,
              height: cellData.height,
              parentId: null,
              instanceOfId: null,
              sourceModelElements: []
            };
            me.currentModel.elements.push(element);
            console.log('Added element to model:', element);
          } else {
            console.log('Element already exists in model:', element);
          }

          let parent = me.graph.getDefaultParent();
          if (cellData.parentId) {
            parent = MxgraphUtils.findVerticeById(me.graph, cellData.parentId, null) || parent;
          }

          var doc = mx.mxUtils.createXmlDocument();
          var node = doc.createElement(cellData.type);
          node.setAttribute("uid", cellData.id);
          node.setAttribute("label", cellData.label); // Asignar el label recibido
          var vertex = me.graph.insertVertex(parent, null, node, cellData.x, cellData.y, cellData.width, cellData.height, cellData.style);

          if (vertex && vertex.value) {
            me.refreshVertexLabel(vertex);
            me.createOverlays(element, vertex);  // Añadir overlays si es necesario
          }
        } else {
          // Es un edge (relación)
          let source = MxgraphUtils.findVerticeById(me.graph, cellData.sourceId, null);
          let target = MxgraphUtils.findVerticeById(me.graph, cellData.targetId, null);
          if (source && target) {
            let existingEdge = me.graph.getModel().getEdgesBetween(source, target, false);
            if (existingEdge.length === 0) {
              var doc = mx.mxUtils.createXmlDocument();
              let node = doc.createElement("relationship");
              node.setAttribute("uid", cellData.id);
              node.setAttribute("label", cellData.label);

              // Asignar las propiedades recibidas
              if (cellData.properties && Array.isArray(cellData.properties)) {
                cellData.properties.forEach(prop => node.setAttribute(prop.name, prop.value));
              }

              let edge = me.graph.insertEdge(me.graph.getDefaultParent(), null, node, source, target, cellData.style);

              // Actualizar el modelo local con la relación y sus propiedades
              let relationship = {
                id: cellData.id,
                name: cellData.label,
                type: cellData.type,
                sourceId: cellData.sourceId,
                targetId: cellData.targetId,
                properties: cellData.properties || [], // Asegurarse de que las propiedades estén presentes
                points: [], // Puedes manejar los puntos según tu implementación
                min: 0, // Agrega el valor adecuado para min
                max: 1, // Agrega el valor adecuado para max
              };
              me.currentModel.relationships.push(relationship);

              me.refreshEdgeLabel(edge);
              me.graph.refresh();
            }
          } else {
            console.warn('Source or target is null. Skipping edge creation.');
          }
        }
      }
    });

    me.graph.refresh();
    me.isLocalChange = false;
  }
});

  me.socket.on('cellRemoved', (data) => {
    console.log('Received cellRemoved:', data);
    if (data.workspaceId === me.workspaceId && data.clientId !== me.clientId) {
        me.isLocalChange = true;
        data.cellIds.forEach(cellId => {
            let cell = MxgraphUtils.findVerticeById(me.graph, cellId, null);
            if (!cell) {
                cell = MxgraphUtils.findEdgeById(me.graph, cellId, null);
            }
            if (cell) {
                me.graph.removeCells([cell], true);
                console.log(`Removed cell/edge with id: ${cellId}`);
            } else {
                console.warn(`Cell/Edge with id ${cellId} not found`);
            }
        });
        me.graph.refresh();
        me.isLocalChange = false;
    }
});

me.socket.on('propertiesChanged', (data) => {
  console.log('Received propertiesChanged:', data);

  if (data.workspaceId === me.workspaceId && data.clientId !== me.clientId) {
    me.isLocalChange = true;

    // Buscar la celda o conexión (edge) por su ID
    let cell = MxgraphUtils.findVerticeById(me.graph, data.cellId, null);
    if (!cell) {
      cell = MxgraphUtils.findEdgeById(me.graph, data.cellId, null);
    }

    if (cell) {
      // Actualizar las propiedades del modelo
      let element = me.props.projectService.findModelElementById(me.currentModel, data.cellId);
      if (!element) {
        element = me.props.projectService.findModelRelationshipById(me.currentModel, data.cellId);
      }

      if (element) {
        data.properties.forEach(prop => {
          if (prop.deleted) {
            // Si la propiedad está marcada como eliminada, removerla
            element.properties = element.properties.filter(p => p.name !== prop.name);
            console.log(`propertiesChanged - Property deleted: ${prop.name}`);
          } else {
            let property = element.properties.find(p => p.name === prop.name);

            // Manejar el cambio de propiedades y el label
            if (property) {
              // Si ya existe la propiedad, se actualiza su valor
              property.value = prop.value;
            } else {
              // Si no existe, se añade la nueva propiedad
              element.properties.push(new Property(
                prop.name, prop.value, prop.type, prop.options, 
                prop.linked_property, prop.linked_value, false, 
                prop.display, prop.comment, prop.possibleValues, 
                prop.possibleValuesLinks, prop.minCardinality, 
                prop.maxCardinality, prop.constraint, prop.defaultValue
              ));
            }

            // Actualizar las propiedades también en el gráfico (para celdas y conexiones)
            cell.value.setAttribute(prop.name, prop.value);

            // Si es la propiedad 'selected', actualizar los overlays del ícono
            if (prop.name === 'Selected') {
              console.log('Updating icon overlay based on selected property');
              me.createOverlays(element, cell); // Actualizar ícono localmente
            }

            // Si es el nombre o label, mostrar log para depuración
            if (prop.name === 'label' || prop.name === 'name') {
              console.log(`propertiesChanged - Label/Name changed: ${prop.name} = ${prop.value}`);
            }
          }
        });

        // Actualizar el nombre del elemento si se ha cambiado
        let nameProp = data.properties.find(prop => prop.name === 'name' || prop.name === 'label');
        if (nameProp) {
          element.name = nameProp.value;
        }

        // Eliminar duplicados de la propiedad 'label'
        element.properties = element.properties.filter((prop, index, self) =>
          index === self.findIndex((p) => p.name === prop.name) || prop.name === 'label');

        // Refrescar la vista del gráfico
        if (cell.edge) {
          me.refreshEdgeLabel(cell);
        } else {
          me.refreshVertexLabel(cell);
        }

        me.graph.refresh();

        // Actualizar el estado si el elemento seleccionado está afectado
        if (me.state.selectedObject && me.state.selectedObject.id === element.id) {
          me.setState({ selectedObject: element });
        }
      }
    }

    me.isLocalChange = false;
  }
});

me.socket.on('cellResized', (data) => {
    console.log('Received cellResized:', data);

    if (data.workspaceId === me.workspaceId && data.clientId !== me.clientId) {
        me.isLocalChange = true;

        data.cells.forEach(cellData => {
            // Buscar la celda por su ID
            let cell = MxgraphUtils.findVerticeById(me.graph, cellData.id, null);
            if (cell) {
                // Actualizar la geometría (tamaño) de la celda
                cell.geometry.width = cellData.width;
                cell.geometry.height = cellData.height;
                cell.geometry.x = cellData.x;  // Por si también se está actualizando la posición
                cell.geometry.y = cellData.y;  // Por si también se está actualizando la posición
                me.graph.refresh();
            } else {
                console.warn(`Cell with id ${cellData.id} not found`);
            }
        });

        me.isLocalChange = false;
    }
});

this.socket.on('cursorMoved', (data) => {
  if (data.workspaceId === this.workspaceId && data.clientId !== this.clientId) {
    this.updateCursor(data.clientId, data.user, data.x, data.y);
  }
});

this.socket.on('edgeStyleChanged', (data) => {
  if (data.workspaceId === me.workspaceId && data.clientId !== me.clientId) {
    let edge = MxgraphUtils.findEdgeById(me.graph, data.edgeId, null);
    if (edge) {
      edge.setStyle(data.style);
      me.graph.refresh();
    }
  }
});

me.socket.on('edgeLabelChanged', (data) => {
  if (data.workspaceId === me.workspaceId && data.clientId !== me.clientId) {
    let cell = MxgraphUtils.findEdgeById(me.graph, data.cellId, null);
    if (cell) {
      cell.value.setAttribute('label', data.label);
      me.refreshEdgeLabel(cell);
      me.graph.refresh();
    }
  }
});

this.socket.on('invitationReceived', (data) => {
  if (data.invitedUserEmail === me.userName) {
    this.setState({
      showInviteModal: true,
      inviteData: data
    });
  }
});

  }

  updateCursor(clientId, user, x, y) {
    // Crear o actualizar la posición del cursor del usuario
    let cursor = document.getElementById(`cursor-${clientId}`);
    let cursorLabel = document.getElementById(`cursor-label-${clientId}`);
    
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.id = `cursor-${clientId}`;
      cursor.style.position = 'absolute';
      cursor.style.width = '10px';
      cursor.style.height = '10px';
      cursor.style.backgroundColor = 'red';
      cursor.style.borderRadius = '50%';
      cursor.style.zIndex = '1000';
      cursor.style.pointerEvents = 'none';
  
      cursorLabel = document.createElement('span');
      cursorLabel.id = `cursor-label-${clientId}`;
      cursorLabel.style.position = 'absolute';
      cursorLabel.style.backgroundColor = 'white';
      cursorLabel.style.border = '1px solid black';
      cursorLabel.style.borderRadius = '3px';
      cursorLabel.style.padding = '2px';
      cursorLabel.style.fontSize = '10px';
      cursorLabel.style.zIndex = '1000';
      cursorLabel.style.pointerEvents = 'none';
      cursorLabel.innerText = user; // Mostrar el nombre del usuario
  
      document.body.appendChild(cursor);
      document.body.appendChild(cursorLabel);
    }
    
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
  
    cursorLabel.style.left = `${x + 15}px`;
    cursorLabel.style.top = `${y - 10}px`;
  }

  LoadGraph(graph: mxGraph) {
    let me = this;
    let ae = mx.mxStencil.prototype.allowEval;
    mx.mxStencil.prototype.allowEval = true;

    mx.mxEvent.disableContextMenu(this.graphContainerRef.current);
    const rubber = new mx.mxRubberband(graph);
    //@ts-ignore
    rubber.setEnabled(true);
    // var parent = graph.getDefaultParent();
    graph.setPanning(true);
    graph.setTooltips(true);
    graph.setConnectable(true);
    graph.setEnabled(true);
    graph.setEdgeLabelsMovable(false);
    graph.setVertexLabelsMovable(false);
    graph.setGridEnabled(true);
    graph.setAllowDanglingEdges(false);

    // Allows dropping cells into new lanes and
    // lanes into new pools, but disallows dropping
    // cells on edges to split edges
    graph.setDropEnabled(true);
    graph.setSplitEnabled(false);

    graph.setHtmlLabels(true);


    //graph.getStylesheet().getDefaultEdgeStyle()["edgeStyle"] = "orthogonalEdgeStyle"; 

    graph.convertValueToString = function (cell) {
      try {
        if (cell.value) {
          if (cell.value.attributes) {
            return cell.value.getAttribute("label", "");
          } else {
            return cell.value;
          }
        }
        else if (cell.attributes) {
          return cell.getAttribute("label", "");
        } else {
          return "";
        }
      } catch (error) {
        return "";
      }
    };
    graph.addListener(mx.mxEvent.CELLS_MOVED, function (sender, evt) {
      if (me.isLocalChange) return;
      if (evt.properties.cells) {
          for (const c of evt.properties.cells) {
              if (c.getGeometry().x < 0 || c.getGeometry().y < 0) {
                  c.getGeometry().x -= evt.properties.dx;
                  c.getGeometry().y -= evt.properties.dy;
                  alert("Out of bounds, position reset");
              }
          }
      }
      evt.consume();
      if (evt.properties.cells) {
          let cell = evt.properties.cells[0];
          if (!cell.value || !cell.value.attributes) {
              return;
          }
          let uid = cell.value.getAttribute("uid");
          if (me.currentModel) {
              for (let i = 0; i < me.currentModel.elements.length; i++) {
                  const element: any = me.currentModel.elements[i];
                  if (element.id === uid) {
                      element.x = cell.geometry.x;
                      element.y = cell.geometry.y;
                      element.width = cell.geometry.width;
                      element.height = cell.geometry.height;
                  }
              }
          }
          let cells = evt.properties.cells.map(cell => ({
              id: cell.value.getAttribute("uid"),
              x: cell.geometry.x,
              y: cell.geometry.y,
              style: cell.getStyle(),
              projectId: me.props.projectService.getProject().id,
              productLineId: me.props.projectService.getProductLineSelected().id,
              modelId: me.props.projectService.getTreeIdItemSelected()
          }));
        me.socket.emit('cellMoved', { clientId: me.clientId, workspaceId: me.workspaceId,  projectId: me.props.projectService.getProject().id,  productLineId: me.props.projectService.getProductLineSelected().id,  modelId: me.props.projectService.getTreeIdItemSelected(), cells });
      console.log('Emitted cellMoved:', { clientId: me.clientId, workspaceId: me.workspaceId,  projectId: me.props.projectService.getProject().id,  productLineId: me.props.projectService.getProductLineSelected().id,  modelId: me.props.projectService.getTreeIdItemSelected(), cells });
      }
  });
  
  graph.addListener(mx.mxEvent.CELLS_ADDED, function (sender, evt) {
    if (me.isLocalChange) return;
    try {
        if (evt.properties.cells) {
            let parentId = null;
            if (evt.properties.parent) {
                if (evt.properties.parent.value) {
                    parentId = evt.properties.parent.value.getAttribute("uid");
                }
            }

            let cells = evt.properties.cells.map(cell => {
                let properties = [];

                // Verificar si el cell es un elemento o una relación y obtener las propiedades adecuadas
                if (cell.value && cell.value.attributes) {
                    const uid = cell.value.getAttribute("uid");

                    // Buscar el elemento o la relación en el modelo
                    let element = me.props.projectService.findModelElementById(me.currentModel, uid);
                    if (!element) {
                        element = me.props.projectService.findModelRelationshipById(me.currentModel, uid);
                    }

                    // Si se encuentra el elemento o relación, mapear sus propiedades
                    if (element) {
                        properties = element.properties.map(prop => ({
                            name: prop.name,
                            value: prop.value,
                            type: prop.type,
                            // Añadir otros atributos de la propiedad si es necesario
                        }));
                    }
                }
                console.log(`CELLS_ADDED - Nombre/Label de la celda: ${cell.value.getAttribute("label")}`);
                return {
                    id: cell.value.getAttribute("uid"),
                    type: cell.value.nodeName,
                    x: cell.geometry.x,
                    y: cell.geometry.y,
                    width: cell.geometry.width,
                    height: cell.geometry.height,
                    label: cell.value.getAttribute("label"),
                    style: cell.getStyle(),
                    projectId: me.props.projectService.getProject().id,
                    productLineId: me.props.projectService.getProductLineSelected().id,
                    modelId:me.props.projectService.getTreeIdItemSelected(),
                    properties // Incluir las propiedades aquí
                };
            });
            me.socket.emit('cellAdded', { clientId: me.clientId, workspaceId: me.workspaceId, projectId: me.props.projectService.getProject().id, productLineId: me.props.projectService.getProductLineSelected().id, modelId: me.props.projectService.getTreeIdItemSelected(), cells });
            console.log('Emitted cellAdded:', { clientId: me.clientId, workspaceId: me.workspaceId, projectId: me.props.projectService.getProject().id, productLineId: me.props.projectService.getProductLineSelected().id, modelId: me.props.projectService.getTreeIdItemSelected(), cells });
        }
    } catch (error) {
        me.processException(error);
    }
});
  
graph.addListener(mx.mxEvent.CELLS_RESIZED, function (sender, evt) {
    if (me.isLocalChange) return;
    evt.consume();

    if (evt.properties.cells) {
        let cells = evt.properties.cells.map(cell => ({
            id: cell.value.getAttribute("uid"),
            x: cell.geometry.x,
            y: cell.geometry.y,
            width: cell.geometry.width,
            height: cell.geometry.height,
            style: cell.getStyle()
        }));

        me.socket.emit('cellResized', { clientId: me.clientId, workspaceId: me.workspaceId, projectId: me.props.projectService.getProject().id, productLineId: me.props.projectService.getProductLineSelected().id, modelId: me.props.projectService.getTreeIdItemSelected(), cells });
        console.log('Emitted cellResized:', { clientId: me.clientId, workspaceId: me.workspaceId, projectId: me.props.projectService.getProject().id, productLineId: me.props.projectService.getProductLineSelected().id, modelId: me.props.projectService.getTreeIdItemSelected(), cells });
    }
});

    graph.addListener(mx.mxEvent.SELECT, function (sender, evt) {
      evt.consume();
    });

    graph.addListener(mx.mxEvent.DOUBLE_CLICK, function (sender, evt) {
      evt.consume();
      if (me.state.selectedObject) {
        me.showPropertiesModal();
      }
    });

    graph.addListener(mx.mxEvent.CLICK, function (sender, evt) {
      try {
        evt.consume();
        if (!me.currentModel) {
          return;
        }
        if (evt.properties.cell) {
          let cell = evt.properties.cell;
          if (cell.value.attributes) {
            let uid = cell.value.getAttribute("uid");
            for (let i = 0; i < me.currentModel.elements.length; i++) {
              const element: any = me.currentModel.elements[i];
              if (element.id === uid) {
                me.props.projectService.raiseEventSelectedElement(
                  me.currentModel,
                  element
                );
                me.setState({
                  selectedObject: element
                });
              }
            }
            for (let i = 0; i < me.currentModel.relationships.length; i++) {
              const relationship: any = me.currentModel.relationships[i];
              if (relationship.id === uid) {
                me.props.projectService.raiseEventSelectedElement(
                  me.currentModel,
                  relationship
                );
                me.setState({
                  selectedObject: relationship
                });
              }
            }
          }
        }
        else {
          if (evt.properties.event.button != 2) {
            me.graph.clearSelection();
          }
        }
        if (evt.properties.event.button == 2) {
          me.showContexMenu(evt.properties.event);
        } else {
          me.hideContexMenu();
        }
      } catch (error) { }
    });



    graph.addListener(mx.mxEvent.CELL_CONNECTED, function (sender, evt) {
      if (me.isLocalChange) return;
      try {
          evt.consume();
          let edge = evt.getProperty("edge");
          let source = edge.source;
          let target = edge.target;
  
          if (!source || !target || !source.value || !target.value) {
              console.warn("Source or target is null or has no value. Skipping cellConnected event.");
              return;
          }
  
          let name = source.value.getAttribute("label") + "_" + target.value.getAttribute("label");
          let relationshipType = null;
  
          let languageDefinition: any = me.props.projectService.getLanguageDefinition("" + me.currentModel.type);
  
          if (languageDefinition.abstractSyntax.relationships) {
              for (let key in languageDefinition.abstractSyntax.relationships) {
                  const rel = languageDefinition.abstractSyntax.relationships[key];
                  if (rel.source == source.value.tagName) {
                      for (let t = 0; t < rel.target.length; t++) {
                          if (rel.target[t] == target.value.tagName) {
                              relationshipType = key;
                              break;
                          }
                      }
                  }
                  if (relationshipType) {
                      break;
                  }
              }
          }
  
          if (!edge.value) {
              const rel = languageDefinition.abstractSyntax.relationships[relationshipType];
              var doc = mx.mxUtils.createXmlDocument();
              var node = doc.createElement("relationship");
              node.setAttribute("label", name);
              edge.value = node;
              let points = [];
              let properties = [];
              if (rel.properties) {
                  for (let i = 0; i < rel.properties.length; i++) {
                      const p = rel.properties[i];
                      const property = new Property(p.name, p.value, p.type, p.options, p.linked_property, p.linked_value, false, true, p.comment, p.possibleValues, p.possibleValuesLinks, p.minCardinality, p.maxCardinality, p.constraint, p.defaultValue);
                      if (p.linked_property) {
                          property.display = false;
                      }
                      if (p.possibleValues) {
                          if (property.possibleValues.includes(",")) {
                              let options = property.possibleValues.split(",");
                              if (options.length > 0) {
                                  property.value = options[0];
                              }
                          }
                      }
                      properties.push(property);
                  }
              }
  
              let relationship = me.props.projectService.createRelationship(
                  me.currentModel,
                  name,
                  relationshipType,
                  source.value.getAttribute("uid"),
                  target.value.getAttribute("uid"),
                  points,
                  rel.min,
                  rel.max,
                  properties
              );
  
              node.setAttribute("uid", relationship.id);
              edge.style = "strokeColor=#446E79;strokeWidth=2;";
          }
          me.refreshEdgeLabel(edge);
          me.refreshEdgeStyle(edge);
  
          // Conversion explícita de attributes a NamedNodeMap y luego a Attr[]
          let attributes = Array.from(edge.value.attributes) as Attr[];
          let edgeAttributes = attributes.map(attr => ({
              name: attr.name,
              value: attr.value
          }));

              console.log('Emitted cellConnected:', {
              clientId: me.clientId,
              sourceId: source.value.getAttribute("uid"),
              targetId: target.value.getAttribute("uid"),
              relationshipId: edge.value.getAttribute("uid"),
              relationshipName: edge.value.getAttribute("label"),
              style: edge.getStyle(),
              properties: edgeAttributes,
              projectId: me.props.projectService.getProject().id,
              productLineId: me.props.projectService.getProductLineSelected().id,
              modelId: me.props.projectService.getTreeIdItemSelected()
          });

          me.socket.emit('cellConnected', {
              clientId: me.clientId,
              workspaceId: me.workspaceId,
              sourceId: source.value.getAttribute("uid"),
              targetId: target.value.getAttribute("uid"),
              relationshipId: edge.value.getAttribute("uid"),
              relationshipName: edge.value.getAttribute("label"),
              style: edge.getStyle(),
              properties: edgeAttributes,
              projectId: me.props.projectService.getProject().id,
              productLineId: me.props.projectService.getProductLineSelected().id,
              modelId: me.props.projectService.getTreeIdItemSelected()
          });

      } catch (error) {
          console.error("something went wrong: ", error);
      }
  });

    // graph.connectionHandler.addListener(mx.mxEvent.CONNECT, function(sender, evt)
    // {
    //   var edge = evt.getProperty('cell');
    //   var source = graph.getModel().getTerminal(edge, true);
    //   var target = graph.getModel().getTerminal(edge, false);
    // });

    graph.addListener(mx.mxEvent.REMOVE_CELLS, function (sender, evt) {
      try {
        evt.consume();
      } catch (error) {
        alert(error);
      }
    });

    graph.addListener(mx.mxEvent.LABEL_CHANGED, function (sender, evt) {
      let t = 0;
      let name = evt.properties.value;
      evt.properties.value = evt.properties.old;
      evt.properties.cell.value = evt.properties.old;
      evt.consume();

      let cell = evt.properties.cell;
      let uid = cell.value.getAttribute("uid");
      if (me.currentModel) {
        const element: any = me.props.projectService.findModelElementById(me.currentModel, uid);
        if (element) {
          element.name = name;
          me.props.projectService.raiseEventUpdatedElement(
            me.currentModel,
            element
          );
        } else {
          const relationship: any = me.props.projectService.findModelRelationshipById(me.currentModel, uid);
          if (relationship) {
            relationship.name = name;
            me.props.projectService.raiseEventUpdatedElement(
              me.currentModel,
              relationship
            );
          }
        }
      }
    });

    graph.addListener(mx.mxEvent.CHANGE, function (sender, evt) {
      try {
        evt.consume();
        var changes = evt.getProperty('edit').changes;
        for (var i = 0; i < changes.length; i++) {
          if (changes[i].constructor.name == "mxTerminalChange") {
            // DO SOMETHING
          }
        }
      } catch (error) {
        alert(error);
      }
    });

    let gmodel = graph.model;
    gmodel.addListener(mx.mxEvent.CHANGE, function (sender, evt) {
      me.graphModel_onChange(sender, evt);
    });


    graph.getView().setAllowEval(true);


    let keyHandler = new mx.mxKeyHandler(graph);
    keyHandler.bindKey(46, function (evt) {
      me.deleteSelection();
    });

    keyHandler.bindKey(8, function (evt) {
      me.deleteSelection();
    });
  }

  deleteSelection() {
    let me = this;
    if (!window.confirm("do you really want to delete the items?")) {
        return;
    }
    let graph = this.graph;
    if (graph.isEnabled()) {
        let cells = graph.getSelectionCells();
        let cellIds = cells.map(cell => cell.value.getAttribute("uid"));

        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            if (cell.value) {
                let uid = cell.value.getAttribute("uid");
                if (uid) {
                    if (cell.edge) {
                        me.props.projectService.removeModelRelationshipById(me.currentModel, uid);
                    } else {
                        me.props.projectService.removeModelElementById(me.currentModel, uid);
                    }
                }
            }
        } 
        graph.removeCells(cells, true);
        me.socket.emit('cellRemoved', { clientId: me.clientId, workspaceId: this.workspaceId, projectId: me.props.projectService.getProject().id, productLineId: me.props.projectService.getProductLineSelected().id, modelId: me.props.projectService.getTreeIdItemSelected(), cellIds });
        console.log('Emitted cellRemoved:', { clientId: me.clientId, cellIds });
    }
}

refreshEdgeStyle(edge: any) {
  let me = this;
  let languageDefinition: any = me.props.projectService.getLanguageDefinition("" + me.currentModel.type);
  let relationship = me.props.projectService.findModelRelationshipById(me.currentModel, edge.value.getAttribute("uid"));
  if (languageDefinition.concreteSyntax.relationships) {
    if (languageDefinition.concreteSyntax.relationships[relationship.type]) {
      //styles
      if (languageDefinition.concreteSyntax.relationships[relationship.type].styles) {
        for (let i = 0; i < languageDefinition.concreteSyntax.relationships[relationship.type].styles.length; i++) {
          const styleDef = languageDefinition.concreteSyntax.relationships[relationship.type].styles[i];
          if (!styleDef.linked_property) {
            edge.style = styleDef.style;
          } else {
            for (let p = 0; p < relationship.properties.length; p++) {
              const property = relationship.properties[p];
              if (property.name == styleDef.linked_property && property.value == styleDef.linked_value) {
                edge.style = styleDef.style;
                i = languageDefinition.concreteSyntax.relationships[relationship.type].styles.length;
                break;
              }
            }
          }
        }
      }

      // Emitir el evento a través del socket
      me.socket.emit('edgeStyleChanged', {
        clientId: me.clientId,
        workspaceId: me.workspaceId,
        projectId: me.props.projectService.getProject().id, 
        productLineId: me.props.projectService.getProductLineSelected().id,
        modelId: me.props.projectService.getTreeIdItemSelected(),
        edgeId: edge.value.getAttribute("uid"),
        style: edge.style
      });

      //labels  
      if (edge.children) {
        for (let index = edge.children.length - 1; index >= 0; index--) {
          let child = edge.getChildAt(index);
          child.setVisible(false);
          //child.removeFromParent(); //no funciona, sigue mostrandolo en pantalla
        }
      }
      if (languageDefinition.concreteSyntax.relationships[relationship.type].labels) {
        for (let i = 0; i < languageDefinition.concreteSyntax.relationships[relationship.type].labels.length; i++) {
          const def = languageDefinition.concreteSyntax.relationships[relationship.type].labels[i];
          let style = ''; // 'fontSize=16;fontColor=#000000;fillColor=#ffffff;strokeColor=#69b630;rounded=1;arcSize=25;strokeWidth=3;';
          if (def.style) {
            style = def.style;
          }
          let labels = [];
          if (def.label_fixed) {
            labels.push("" + def.label_fixed);
          } else if (def.label_property) {
            let ls = [];
            if (Array.isArray(def.label_property)) {
              ls = def.label_property;
            } else {
              ls = [def.label_property];
            }
            for (let p = 0; p < relationship.properties.length; p++) {
              const property = relationship.properties[p];
              if (ls.includes(property.name)) {
                if (property.value) {
                  labels.push("" + property.value);
                } else {
                  labels.push("");
                }
              }
            }
          }
          if (labels.length > 0) {
            let separator = ", "
            if (def.label_separator) {
              separator = def.label_separator;
            }
            let label = labels.join(separator);
            let x = 0;
            let y = 0;
            let offx = 0;
            if (def.offset_x) {
              offx = (def.offset_x / 100);
            }
            let offy = 0;
            if (def.offset_y) {
              offy = def.offset_y
            }
            switch (def.align) {
              case "left":
                x = -1 + offx;
                break;
              case "right":
                x = +1 + offx;
                break;
            }
            if (def.offset_x) {
              offx = def.offset_x
            }
            if (def.offset_y) {
              offy = def.offset_y
            }
            var e21 = this.graph.insertVertex(edge, null, label, x, y, 1, 1, style, true);
            e21.setConnectable(false);
            this.graph.updateCellSize(e21);
            // Adds padding (labelPadding not working...)
            e21.geometry.width += 2;
            e21.geometry.height += 2;

            offx = 0;
            e21.geometry.offset = new mx.mxPoint(offx, offy); //offsetx aqui no funciona correctamente cuando la dirección se invierte
          }
        }
      }
    }
  }
}

refreshEdgeLabel(edge: any) {
  let me = this;
  let languageDefinition: any = me.props.projectService.getLanguageDefinition("" + me.currentModel.type);

  // Verificar si edge y value están definidos
  if (!edge || !edge.value) {
      console.warn("Edge o su valor están indefinidos. No se puede refrescar la etiqueta.");
      return;
  }

  let relationship = me.props.projectService.findModelRelationshipById(me.currentModel, edge.value.getAttribute("uid"));

  // Verificar si el relationship existe
  if (!relationship) {
      console.warn(`Relationship con UID ${edge.value.getAttribute("uid")} no encontrado en el modelo actual.`);
      return;
  }

  // Verificar si el relationship tiene un tipo definido
  if (!relationship.type) {
      console.warn(`El relationship con UID ${edge.value.getAttribute("uid")} no tiene un tipo definido.`);
      return;
  }

  let label_property = null;

  if (languageDefinition.concreteSyntax.relationships) {
      if (languageDefinition.concreteSyntax.relationships[relationship.type]) {
          if (languageDefinition.concreteSyntax.relationships[relationship.type].label_fixed) {
              edge.value.setAttribute("label", languageDefinition.concreteSyntax.relationships[relationship.type].label_fixed);
              me.socket.emit('edgeLabelChanged', { clientId: me.clientId, workspaceId: me.workspaceId, projectId: me.props.projectService.getProject().id, productLineId: me.props.projectService.getProductLineSelected().id, modelId: me.props.projectService.getTreeIdItemSelected(), cellId: edge.value.getAttribute("uid"), label: languageDefinition.concreteSyntax.relationships[relationship.type].label_fixed });
              return;
          } else if (languageDefinition.concreteSyntax.relationships[relationship.type].label_property) {
              label_property = languageDefinition.concreteSyntax.relationships[relationship.type].label_property;
              for (let p = 0; p < relationship.properties.length; p++) {
                  const property = relationship.properties[p];
                  if (property.name == label_property) {
                      edge.value.setAttribute("label", property.value);
                      me.socket.emit('edgeLabelChanged', { clientId: me.clientId, workspaceId: me.workspaceId, projectId: me.props.projectService.getProject().id, productLineId: me.props.projectService.getProductLineSelected().id, modelId: me.props.projectService.getTreeIdItemSelected(), cellId: edge.value.getAttribute("uid"), label: property.value });
                      return;
                  }
              }
          }
      }
  }

  if (!label_property) {
      edge.value.setAttribute("label", relationship.name);
      me.socket.emit('edgeLabelChanged', { clientId: me.clientId, workspaceId: me.workspaceId, projectId: me.props.projectService.getProject().id, productLineId: me.props.projectService.getProductLineSelected().id, modelId: me.props.projectService.getTreeIdItemSelected(), cellId: edge.value.getAttribute("uid"), label: relationship.name });
  } else {
      edge.value.setAttribute("label", "");
      me.socket.emit('edgeLabelChanged', { clientId: me.clientId, workspaceId: me.workspaceId, projectId: me.props.projectService.getProject().id, productLineId: me.props.projectService.getProductLineSelected().id, modelId: me.props.projectService.getTreeIdItemSelected(),cellId: edge.value.getAttribute("uid"), label: "" });
  }
}

refreshVertexLabel(vertice: any) {
  let me = this;
  let languageDefinition: any =
    me.props.projectService.getLanguageDefinition(
      "" + me.currentModel.type
    );
  let label_property = null;
  let uid=vertice.value.getAttribute("uid");
  let element = me.props.projectService.findModelElementById(me.currentModel, uid);
  if(!element){
    return;
  }

  vertice.value.setAttribute("Name", element.name);
  for (let i = 0; i < element.properties.length; i++) {
    const p = element.properties[i];
    vertice.value.setAttribute(p.name, p.value);
  }

  if (languageDefinition.concreteSyntax.elements) {
    if (languageDefinition.concreteSyntax.elements[element.type]) {
      if (languageDefinition.concreteSyntax.elements[element.type].label_fixed) {
        vertice.value.setAttribute("label", languageDefinition.concreteSyntax.elements[element.type].label_fixed);
        return;
      }
      else if (languageDefinition.concreteSyntax.elements[element.type].label_property) {
        label_property = languageDefinition.concreteSyntax.elements[element.type].label_property;
        for (let p = 0; p < element.properties.length; p++) {
          const property = element.properties[p];
          if (property.name == languageDefinition.concreteSyntax.elements[element.type].label_property) {
            vertice.value.setAttribute("label", property.value);
            return;
          }
        }
      }
    }
  }
  if (!label_property) {
    vertice.value.setAttribute("label", element.name);
  } else {
    vertice.value.setAttribute("label", "");
  }
}

  pushIfNotExist(array: any, value: any) {
    for (let i = 0; i < array.length; i++) {
      const item = array[i];
      if (item == value) {
        return;
      }
    }
    array.push(value);
  }

  graphModel_onChange(sender, evt) {
    let me = this;
    try {
      evt.consume();
      var changes = evt.getProperty('edit').changes;
      for (var i = 0; i < changes.length; i++) {
        let change = changes[i];
        if (change.constructor.name == "mxGeometryChange") {
          if (change.cell) {
            let cell = change.cell;
            if (!cell.value.attributes) {
              return;
            }
            let uid = cell.value.getAttribute("uid");
            const relationship: Relationship = me.props.projectService.findModelRelationshipById(me.currentModel, uid);
            if (!relationship) {
              return;
            }
            relationship.points = [];
            if (change.geometry.points) {
              for (let i = 0; i < change.geometry.points.length; i++) {
                const p = cell.geometry.points[i];
                relationship.points.push(new Point(p.x, p.y))
              }
            }
          }
        }
      }
    } catch (error) {
      me.processException(error);
    }
  }

  loadModel(model: Model) {
    let me = this;
    this.currentModel = model;
    if (!model) {
      this.setState({
        currentModelConstraints: null
      })
    } else {
      this.setState({
        currentModelConstraints: model.constraints
      });
      if (model.inconsistent) {
        this.showMessageModal("Inconsistent model", model.consistencyError);
      }
    }
    this.setState({
      showContextMenuElement: false
    });

    let graph: mxGraph | undefined = this.graph;
    if (graph) {
      graph.getModel().beginUpdate();
      try {
        graph.removeCells(graph.getChildVertices(graph.getDefaultParent()));
        if (model) {
          let languageDefinition: any = this.props.projectService.getLanguageDefinition("" + model.type);
          let orden = [];
          for (let i = 0; i < model.elements.length; i++) {
            let element: any = model.elements[i];
            if (element.parentId) {
              this.pushIfNotExist(orden, element.parentId);
            }
            this.pushIfNotExist(orden, element.id);
          }

          let vertices = [];

          for (let i = 0; i < orden.length; i++) {
            let element: any = this.props.projectService.findModelElementById(model, orden[i]);

            if (languageDefinition.concreteSyntax.elements[element.type].draw) {
              let shape = atob(
                languageDefinition.concreteSyntax.elements[element.type].draw
              );
              let ne: any = mx.mxUtils.parseXml(shape).documentElement;
              ne.setAttribute("name", element.type);
              MxgraphUtils.modifyShape(ne);
              let stencil = new mx.mxStencil(ne);
              mx.mxStencilRegistry.addStencil(element.type, stencil);
            }

            let parent = graph.getDefaultParent();
            if (element.parentId) {
              parent = vertices[element.parentId];
            }

            var doc = mx.mxUtils.createXmlDocument();
            var node = doc.createElement(element.type);
            node.setAttribute("uid", element.id);
            node.setAttribute("label", element.name);
            node.setAttribute("Name", element.name);
            for (let i = 0; i < element.properties.length; i++) {
              const p = element.properties[i];
              node.setAttribute(p.name, p.value);
            }
            let fontcolor = "";
            if (languageDefinition.concreteSyntax.elements[element.type].draw) {
              let shape = atob(
                languageDefinition.concreteSyntax.elements[element.type].draw
              );
              let color = this.getFontColorFromShape(shape);
              if (color) {
                fontcolor = "fontColor=" + color + ";"
              }
            }
            let design = languageDefinition.concreteSyntax.elements[element.type].design;
            var vertex = graph.insertVertex(
              parent,
              null,
              node,
              element.x,
              element.y,
              element.width,
              element.height,
              "shape=" +
              element.type +
              ";whiteSpace=wrap;" + fontcolor + design
            );
            this.refreshVertexLabel(vertex);
            this.createOverlays(element, vertex);
            vertices[element.id] = vertex;
          }

          let parent = graph.getDefaultParent();

          for (let i = 0; i < model.relationships.length; i++) {
            const relationship: Relationship = model.relationships[i];
            let source = MxgraphUtils.findVerticeById(graph, relationship.sourceId, null);
            let target = MxgraphUtils.findVerticeById(graph, relationship.targetId, null);
            let doc = mx.mxUtils.createXmlDocument();
            let node = doc.createElement("relationship");
            node.setAttribute("uid", relationship.id);
            node.setAttribute("label", relationship.name);
            node.setAttribute("type", relationship.type);

            var cell = this.graph?.insertEdge(parent, null, node, source, target, 'strokeColor=#69b630;strokeWidth=3;endArrow=block;endSize=8;edgeStyle=elbowEdgeStyle;');
            cell.geometry.points = [];
            if (relationship.points) {
              for (let k = 0; k < relationship.points.length; k++) {
                const p = relationship.points[k];
                cell.geometry.points.push(new mx.mxPoint(p.x, p.y));
              }
            }
          }
        }
      } finally {
        this.graph?.getModel().endUpdate();
      }
    }
  }

  getFontColorFromShape(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");
    const shapeElement = xmlDoc.querySelector("shape");
    const aspectValue = shapeElement ? shapeElement.getAttribute("fontcolor") : null;
    return aspectValue;
  }

  //sacar esto en una libreria


  createOverlays(element: any, cell: any) {
    this.graph.removeCellOverlays(cell);
    this.createSelectionOverlay(element, cell);
    this.createCustomOverlays(element, cell);
  }

  createSelectionOverlay(element: any, cell: any) {
    let me = this;
    for (let i = 0; i < element.properties.length; i++) {
      const property = element.properties[i];
      if (property.name == "Selected") {
        let icon = 'images/models/' + property.value + '.png'
        let overlayFrame = new mx.mxCellOverlay(new mx.mxImage(icon, 24, 24), 'Overlay tooltip');
        overlayFrame.align = mx.mxConstants.ALIGN_RIGHT;
        overlayFrame.verticalAlign = mx.mxConstants.ALIGN_TOP;
        overlayFrame.offset = new mx.mxPoint(0, 0);

        overlayFrame.addListener(mx.mxEvent.CLICK, function (sender, evt) {
          try {
            evt.consume();
            let parentCell = evt.properties.cell;
            let uid = parentCell.value.attributes.uid.value;
            let element = me.props.projectService.findModelElementById(me.currentModel, uid);
            for (let i = 0; i < element.properties.length; i++) {
              const property = element.properties[i];
              if (property.name == "Selected") {
                switch (property.value) {
                  case "Selected": property.value = "Unselected"; break;
                  case "Unselected": property.value = "Undefined"; break;
                  case "Undefined": property.value = "Selected"; break;
                  default: property.value = "Unselected"; break;
                }
              }
            }
            me.createOverlays(element, parentCell);
          } catch (error) { }
        });

        this.graph.addCellOverlay(cell, overlayFrame);
        this.graph.refresh();
      }
    }
  }

  createCustomOverlays(element: any, cell: any) {
    let me = this;
    let languageDefinition: any =
      me.props.projectService.getLanguageDefinition(
        "" + me.currentModel.type
      );

    if (languageDefinition.concreteSyntax.elements) {
      if (languageDefinition.concreteSyntax.elements[element.type]) {
        if (languageDefinition.concreteSyntax.elements[element.type].overlays) {
          let overs = [];
          for (let i = 0; i < languageDefinition.concreteSyntax.elements[element.type].overlays.length; i++) {
            let overlayDef = languageDefinition.concreteSyntax.elements[element.type].overlays[i];
            if (!overlayDef.linked_property) {
              overs[overlayDef.align] = overlayDef;
            }
          }
          for (let i = 0; i < languageDefinition.concreteSyntax.elements[element.type].overlays.length; i++) {
            let overlayDef = languageDefinition.concreteSyntax.elements[element.type].overlays[i];
            if (overlayDef.linked_property) {
              for (let p = 0; p < element.properties.length; p++) {
                const property = element.properties[p];
                if (property.name == overlayDef.linked_property && property.value == overlayDef.linked_value) {
                  overs[overlayDef.align] = overlayDef;
                }
              }
            }
          }
          for (let key in overs) {
            let overlayDef = overs[key];
            this.createCustomOverlay(cell, overlayDef.icon, overlayDef.align, overlayDef.width, overlayDef.height, overlayDef.offset_x, overlayDef.offset_y);
          }
        }
      }
    }
  }

  createCustomOverlay(cell: any, base64Icon: any, align: any, width: any, height: any, offset_x: any, offset_y: any) {
    let me = this;
    let url = "data:image/png;base64," + base64Icon;
    //let icon=this.DecodeImage(base64Icon);
    //icon=icon.substring(5);
    //icon='images/models/Undefined.png';
    if (!width) {
      width = 24;
    }
    if (!height) {
      height = 24;
    }
    let overlayFrame = new mx.mxCellOverlay(new mx.mxImage(url, width, height), 'Overlay tooltip');
    overlayFrame.verticalAlign = mx.mxConstants.ALIGN_BOTTOM;
    overlayFrame.align = mx.mxConstants.ALIGN_LEFT;
    switch (align) {
      case "top-left":
        overlayFrame.verticalAlign = mx.mxConstants.ALIGN_TOP;
        overlayFrame.align = mx.mxConstants.ALIGN_LEFT;
        break;
      case "top-right":
        overlayFrame.verticalAlign = mx.mxConstants.ALIGN_TOP;
        overlayFrame.align = mx.mxConstants.ALIGN_RIGHT;
        break;
      case "bottom-left":
        overlayFrame.verticalAlign = mx.mxConstants.ALIGN_BOTTOM;
        overlayFrame.align = mx.mxConstants.ALIGN_LEFT;
        break;
      case "bottom-right":
        overlayFrame.verticalAlign = mx.mxConstants.ALIGN_BOTTOM;
        overlayFrame.align = mx.mxConstants.ALIGN_RIGHT;
        break;
      case "middle":
        overlayFrame.verticalAlign = mx.mxConstants.ALIGN_MIDDLE;
        overlayFrame.align = mx.mxConstants.ALIGN_CENTER;
        break;
      case "middle-left":
        overlayFrame.verticalAlign = mx.mxConstants.ALIGN_MIDDLE;
        overlayFrame.align = mx.mxConstants.ALIGN_LEFT;
        break;
      case "middle-right":
        overlayFrame.verticalAlign = mx.mxConstants.ALIGN_MIDDLE;
        overlayFrame.align = mx.mxConstants.ALIGN_RIGHT;
        break;
      case "middle-top":
        overlayFrame.verticalAlign = mx.mxConstants.ALIGN_TOP;
        overlayFrame.align = mx.mxConstants.ALIGN_CENTER;
        break;
      case "middle-bottom":
        overlayFrame.verticalAlign = mx.mxConstants.ALIGN_BOTTOM;
        overlayFrame.align = mx.mxConstants.ALIGN_CENTER;
        break;



    }
    let offx = 0;
    let offy = 0;
    if (offset_x) {
      offx = offset_x;
    }
    if (offset_y) {
      offy = offset_y;
    }
    overlayFrame.offset = new mx.mxPoint(offx, offy);
    this.graph.addCellOverlay(cell, overlayFrame);
    this.graph.refresh();
  }

  DecodeImage(imageBase64: any) {
    let contentType = "image/png";
    let blob = this.b64toBlob(imageBase64, contentType);
    let iconUrl = URL.createObjectURL(blob);
    return iconUrl;
  }

  b64toBlob(b64Data, contentType = "", sliceSize = 512) {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);

      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }

      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    const blob = new Blob(byteArrays, { type: contentType });
    return blob;
  }

  test() {
    return "hello world...";
  }

  zoomIn() {
    this.graph.zoomIn();
  }

  zoomOut() {
    this.graph.zoomOut();
  }

  saveConfiguration() {
    this.props.projectService.raiseEventRequestSaveConfigurationListener(this.props.projectService.project, this.currentModel.id);
  }

  openConfiguration() {
    this.props.projectService.raiseEventRequestOpenConfigurationListener(this.props.projectService.project, this.currentModel.id);
  }

  resetConfiguration() {
    this.props.projectService.resetConfiguration(this.currentModel);
  }

  checkConsistency() {
    this.props.projectService.checkConsistency(this.currentModel);
  }

  downloadImage() {
    MxgraphUtils.exportFile(this.graph, "png");
  }

  processException(ex) {
    alert(JSON.stringify(ex));
  }

  btnZoomIn_onClick(e) {
    try {
      this.zoomIn();
    } catch (ex) {
      this.processException(ex);
    }
  }

  btnZoomOut_onClick(e) {
    try {
      this.zoomOut();
    } catch (ex) {
      this.processException(ex);
    }
  }

  btnDownloadImage_onClick(e) {
    try {
      this.downloadImage();
    } catch (ex) {
      this.processException(ex);
    }
  }

  btnSaveConfiguration_onClick(e) {
    try {
      this.saveConfiguration();
    } catch (ex) {
      this.processException(ex);
    }
  }

  btnOpenConfiguration_onClick(e) {
    try {
      this.openConfiguration();
    } catch (ex) {
      this.processException(ex);
    }
  }

  btnResetConfiguration_onClick(e) {
    try {
      if (window.confirm("Do you really want to reset the configuration?")) {
        this.resetConfiguration();
      }
    } catch (ex) {
      this.processException(ex);
    }
  }

  btnCheckConsistency_onClick(e) {
    try {
      this.checkConsistency();
    } catch (ex) {
      this.processException(ex);
    }
  }

  contexMenuElement_onClick(e) {
    try {
      e.preventDefault();
      this.setState({ showContextMenuElement: false });
      let command = e.target.attributes['data-command'].value;
      switch (command) {
        case "Delete":
          this.deleteSelection();
          break;
        case "Properties":
          this.showPropertiesModal();
          break;
        default:
          this.callExternalFuntion(command);
          break;
      }
    } catch (ex) {
      this.processException(ex);
    }
  }

  callExternalFuntion(index: number): void {
    let selectedElementsIds = MxgraphUtils.GetSelectedElementsIds(this.graph, this.currentModel);
    let selectedRelationshipsIds = MxgraphUtils.GetSelectedRelationshipsIds(this.graph, this.currentModel);
    this.callExternalFuntionFromIndex(index, selectedElementsIds, selectedRelationshipsIds);
  }

  callExternalFuntionFromIndex(index: number, selectedElementsIds: any, selectedRelationshipsIds: any): void {
    let efunction = this.props.projectService.externalFunctions[index];
    let query = null;
    this.props.projectService.callExternalFuntion(efunction, query, selectedElementsIds, selectedRelationshipsIds);
  }

  showConstraintModal() {
    if (this.currentModel) {
      if (this.currentModel.constraints !== "") {
        this.setState({ currentModelConstraints: this.currentModel.constraints })
      }
      this.setState({ showConstraintModal: true })
    } else {
      alertify.error("You have not opened a model")
    }
  }

  hideConstraintModal() {
    this.setState({ showConstraintModal: false })
  }

  saveConstraints() {
    if (this.currentModel) {
      // TODO: Everything we are doing with respect to
      // the model management is an anti pattern
      this.currentModel.constraints = this.state.currentModelConstraints;
    }
    //this.hideConstraintModal();
  }

  showPropertiesModal() {
    // if (this.currentModel) {
    //   if (this.currentModel.constraints !== "") {
    //     this.setState({ currentModelConstraints: this.currentModel.constraints })
    //   }
    //   this.setState({ showConstraintModal: true })
    // } else {
    //   alertify.error("You have not opened a model")
    // }
    this.setState({ showPropertiesModal: true });
  }

  hidePropertiesModal() {
    this.setState({ showPropertiesModal: false });
  
    if (this.state.selectedObject) {
      // Recopilar todas las propiedades que se van a actualizar
      let properties = this.state.selectedObject.properties.map(prop => ({
        name: prop.name,
        value: prop.value,
        type: prop.type,
        options: prop.options,
        linked_property: prop.linked_property,
        linked_value: prop.linked_value,
        display: prop.display,
        comment: prop.comment,
        possibleValues: prop.possibleValues,
        possibleValuesLinks: prop.possibleValuesLinks,
        minCardinality: prop.minCardinality,
        maxCardinality: prop.maxCardinality,
        constraint: prop.constraint
      }));
  
      // Asegurar que se esté manejando correctamente el label o name
      let labelProp = properties.find(prop => prop.name === 'label' || prop.name === 'name');
      if (!labelProp) {
        // Si no existe la propiedad label, añadirla desde el selectedObject
        properties.push({
          name: 'label',
          value: this.state.selectedObject.name || 'Unnamed',
          type: 'String'
        });
      } else {
        // Si ya existe la propiedad, actualizarla
        labelProp.value = this.state.selectedObject.name || labelProp.value || 'Unnamed';
      }
  
      // Eliminar cualquier duplicado de 'label' o 'name'
      properties = properties.filter((prop, index, self) =>
        index === self.findIndex((p) => p.name === prop.name));
  
      // Revisar si alguna propiedad ha sido eliminada (comprobar las propiedades originales y las nuevas)
      let originalProperties = this.state.selectedObject.originalProperties || [];
      let deletedProperties = originalProperties.filter(origProp => 
        !properties.find(prop => prop.name === origProp.name));
  
      // Emitir eliminación de propiedades si es necesario
      if (deletedProperties.length > 0) {
        deletedProperties.forEach(deletedProp => {
          this.socket.emit('propertiesChanged', { 
            clientId: this.clientId,
            workspaceId: this.workspaceId, 
            projectId: this.props.projectService.getProject().id, 
            productLineId: this.props.projectService.getProductLineSelected().id,
            modelId: this.props.projectService.getTreeIdItemSelected(), 
            cellId: this.state.selectedObject.id,
            properties: [{ name: deletedProp.name, deleted: true }], // Marcamos la propiedad como eliminada
            type: this.state.selectedObject.type
          });
  
          console.log('Emitted propertiesChanged for deleted property:', deletedProp.name);
        });
      }
  
      // Emisión de cambios de propiedades para celdas y conexiones
      this.socket.emit('propertiesChanged', { 
        clientId: this.clientId,
        workspaceId: this.workspaceId, 
        projectId: this.props.projectService.getProject().id, 
        productLineId: this.props.projectService.getProductLineSelected().id,
        modelId: this.props.projectService.getTreeIdItemSelected(), 
        cellId: this.state.selectedObject.id,
        properties, // Propiedades editadas o añadidas
        type: this.state.selectedObject.type // Incluimos el tipo para identificar si es una relación (edge) o un vértice
      });
  
      console.log('Emitted propertiesChanged:', { 
        clientId: this.clientId,
        workspaceId: this.workspaceId, 
        projectId: this.props.projectService.getProject().id, 
        productLineId: this.props.projectService.getProductLineSelected().id,
        modelId: this.props.projectService.getTreeIdItemSelected(), 
        cellId: this.state.selectedObject.id,
        properties,
        type: this.state.selectedObject.type
      });
  
      // Actualizamos las propiedades originales para la próxima vez que se edite este objeto
      this.state.selectedObject.originalProperties = [...properties];
    }
  
    // Manejar funciones externas si es necesario
    for (let i = 0; i < this.props.projectService.externalFunctions.length; i++) {
      const efunction = this.props.projectService.externalFunctions[i];
      if (efunction.id == 510 || efunction.id == 511) {
        let selectedElementsIds = [this.state.selectedObject.id];
        this.callExternalFuntionFromIndex(i, selectedElementsIds, null);
      }
    }
  }
      
handleInviteCollaborator() {
  const invitedUserEmail = prompt('Ingresa el email del usuario que deseas invitar:');
  if (invitedUserEmail) {
      this.socket.emit('sendInvitation', {
          inviterName: this.userName,
          invitedUserEmail: invitedUserEmail,
          workspaceId: this.workspaceId, // Obtener el ID del workspace actual
      });
      alert(`Invitación enviada a ${invitedUserEmail}`);
  }
}

handleAcceptInvitation() {
  if (this.state.inviteData) {
    console.log(`Joining workspace with ID: ${this.state.inviteData.workspaceId}`);
    this.props.projectService.joinWorkspace(this.state.inviteData.workspaceId);
    this.workspaceId = this.state.inviteData.workspaceId;  // Asegurarse de que el workspaceId se actualice correctamente
    this.setState({ showInviteModal: false, inviteData: null });
  }
}

  savePropertiesModal() {
    // if (this.currentModel) {
    //   // TODO: Everything we are doing with respect to
    //   // the model management is an anti pattern
    //   this.currentModel.constraints = this.state.currentModelConstraints;
    // }
    // //this.hideConstraintModal();
  }

  showMessageModal(title, message) {
    this.setState({
      showMessageModal: true,
      messageModalTitle: title,
      messageModalContent: message
    });
  }

  hideMessageModal() {
    this.setState({ showMessageModal: false });
  }

  showContexMenu(e) {
    let mx = e.clientX;
    let my = e.clientY;
    this.setState({ showContextMenuElement: true, contextMenuX: mx, contextMenuY: my });
  }

  hideContexMenu() {
    this.setState({ showContextMenuElement: false });
  }

  renderContexMenu() {
    if (!this.graph || !this.currentModel) {
      return;
    }

    let items = [];

    let selectedElementsIds = MxgraphUtils.GetSelectedElementsIds(this.graph, this.currentModel);
    let selectedRelationshipsIds = MxgraphUtils.GetSelectedRelationshipsIds(this.graph, this.currentModel);

    if (selectedElementsIds.length > 0 || selectedRelationshipsIds.length > 0) {
      items.push(<Dropdown.Item href="#" onClick={this.contexMenuElement_onClick.bind(this)} data-command="Delete">Delete</Dropdown.Item>);
      items.push(<Dropdown.Item href="#" onClick={this.contexMenuElement_onClick.bind(this)} data-command="Properties">Properties</Dropdown.Item>);
    }

    if (this.props.projectService.externalFunctions) {
      for (let i = 0; i < this.props.projectService.externalFunctions.length; i++) {
        const externalFunction = this.props.projectService.externalFunctions[i];
        items.push(<Dropdown.Item href="#" onClick={this.contexMenuElement_onClick.bind(this)} data-command={i}>{externalFunction.label}</Dropdown.Item>);
      }
    }

    let left = this.state.contextMenuX + "px";
    let top = this.state.contextMenuY + "px";

    return (
      <Dropdown.Menu
        show={this.state.showContextMenuElement}
        style={{ left: left, top: top }}>
        {items}
      </Dropdown.Menu>
    );
  }

  render() {
    return (
      <div ref={this.containerRef} className="MxGEditor">
        <div className="header">
          <a title="Edit properties" onClick={this.showPropertiesModal}><span><BsFillPencilFill /></span></a>{" "}
          <a title="Zoom in" onClick={this.btnZoomIn_onClick.bind(this)}><span><ImZoomIn /></span></a>{" "}
          <a title="Zoom out" onClick={this.btnZoomOut_onClick.bind(this)}><span><ImZoomOut /></span></a>
          <a title="Download image" onClick={this.btnDownloadImage_onClick.bind(this)} style={{ display: 'none' }}><i className="bi bi-card-image"></i></a>
          <a title="Save configuration" onClick={this.btnSaveConfiguration_onClick.bind(this)}><span><RiSave3Fill /></span></a>
          <a title="Load configuration" onClick={this.btnOpenConfiguration_onClick.bind(this)}><span><FaRegFolderOpen /></span></a>
          <a title="Reset configuration" onClick={this.btnResetConfiguration_onClick.bind(this)}><span><FaBolt /></span></a>
          <a title="Check consistency" onClick={this.btnCheckConsistency_onClick.bind(this)}><span><IoMdAlert /></span></a>

          <Button variant="primary" onClick={this.handleInviteCollaborator.bind(this)}>
          Invitar a colaborar
          </Button>

        </div>
        {this.renderContexMenu()}
        <div ref={this.graphContainerRef} className="GraphContainer"></div>
        <div>
          <Modal
            show={this.state.showPropertiesModal}
            onHide={this.hidePropertiesModal}
            size="lg"
            centered
          >
            <Modal.Header closeButton>
              <Modal.Title>
                Properties
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <div style={{ maxHeight: "65vh", overflow: "auto" }}>
                <MxProperties projectService={this.props.projectService} model={this.currentModel} item={this.state.selectedObject} />
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="primary"
                onClick={this.hidePropertiesModal}
              >
                Close
              </Button>
            </Modal.Footer>
          </Modal>
        </div>
        <div>
          <Modal
            show={this.state.showMessageModal}
            onHide={this.hideMessageModal}
            size="lg"
            centered
          >
            <Modal.Header closeButton>
              <Modal.Title>
                {this.state.messageModalTitle}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <div style={{ maxHeight: "65vh", overflow: "auto" }}>
                <p>{this.state.messageModalContent}</p>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="primary" onClick={this.hideMessageModal}>
                Close
              </Button>
            </Modal.Footer>
          </Modal>
        </div>

        <Modal
  show={this.state.showInviteModal}
  onHide={() => this.setState({ showInviteModal: false })}
>
  <Modal.Header closeButton>
    <Modal.Title>Invitación a colaborar</Modal.Title>
  </Modal.Header>
  <Modal.Body>
    {this.state.inviteData && (
      <p>{this.state.inviteData.inviterName} te ha invitado a colaborar en su workspace. ¿Deseas unirte?</p>
    )}
  </Modal.Body>
  <Modal.Footer>
    <Button variant="secondary" onClick={() => this.setState({ showInviteModal: false })}>
      Cancelar
    </Button>
    <Button variant="primary" onClick={() => this.handleAcceptInvitation()}>
      Aceptar
    </Button>
  </Modal.Footer>
</Modal>
      </div>
    );
  }
}

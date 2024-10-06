import { useState, useMemo } from "react";

import ListGroup from "react-bootstrap/ListGroup";
import Button from "react-bootstrap/Button";
import Pagination from "react-bootstrap/Pagination";

import ProjectService from "../../Application/Project/ProjectService";

import { Project } from "../../Domain/ProductLineEngineering/Entities/Project";
import mx from "../MxGEditor/mxgraph";
import MxgraphUtils from "../../Infraestructure/Mxgraph/MxgraphUtils";

type QueryResultProps = {
  index: number;
  result: object | Array<any> | boolean;
  projectService: ProjectService;
  onVisualize:any
};

function isIterationResult(result: Array<any> | object | boolean): boolean {
  return (
    Array.isArray(result) &&
    result.some((elem) => Array.isArray(elem) && elem.length === 2)
  );
}

function hasFailedIterationResult(
  result: Array<any> | object | boolean
): boolean {
  return (
    Array.isArray(result) &&
    result.some((elem) => Array.isArray(elem) && elem.length === 2 && !elem[1])
  );
}

export default function QueryResult({
  index,
  result,
  projectService,
  onVisualize
}: QueryResultProps) {
  const [paginationSelection, setPaginationSelection] = useState(0);

  const visibleResults = useMemo(() => {
    if (Array.isArray(result) && isIterationResult(result)) {
      return (
        result
          .map((elem) => [
            elem[0].replace("UUID_", "").replaceAll("_", "-"),
            elem[1],
          ])
          .filter((elem) => !elem[1])
      );
    } else {
      return result;
    }
  }, [result]);

  const handleVisualize = () => {
    // Log para depuración
    console.info("Visualizing solution ", index, " of query result", result);

    const graph = projectService.getGraph();

    if (!Array.isArray(result)) {
      // Visualización de un solo resultado de proyecto
      projectService.updateSelection(
        result as Project,
        projectService.getTreeIdItemSelected()
      );
      graph.refresh();
    } else {
      // Si es una lista de resultados (e.g., de iteración)
      result.forEach((item, idx) => {
        const element = item[paginationSelection];
        
        // Buscar la celda en el grafo usando su ID
        const cell = graph.getModel().getCell(element.id);
        
        if (cell) {
          console.log(`Updating properties of cell with ID: ${element.id}`);

          // Emisión de propiedades actualizadas en lugar de crear nuevas celdas
          const properties = element.properties.map((prop: any) => ({
            name: prop.name,
            value: prop.value,
            type: prop.type
          }));

          projectService.getSocket().emit('propertiesChanged', {
            clientId: projectService.getClientId(),
            workspaceId: projectService.getWorkspaceId(),
            projectId: projectService.getProject().id,
            productLineId: projectService.getProductLineSelected().id,
            modelId: projectService.getTreeIdItemSelected(),
            cellId: cell.value.getAttribute('uid'),
            properties
          });

          console.log(`Emitted propertiesChanged for cell ID: ${element.id}`);
        } else {
          console.warn(`Cell with ID ${element.id} not found in graph.`);
        }
      });

      // Refrescar el grafo después de actualizar las propiedades
      graph.refresh();
    }

    // Llamada a la función callback de visualización
    if (onVisualize) {
      onVisualize();
    }
  };

  return (
    <>
      <ListGroup horizontal className="flex d-flex my-2">
        <ListGroup.Item className="flex-fill d-flex align-items-center justify-content-center">
          Solution {index}
        </ListGroup.Item>
        {Array.isArray(visibleResults) && (
          <ListGroup.Item
            className="flex-fill d-flex align-items-center justify-content-center"
            style={{ overflow: "hidden" }}
          >
            {visibleResults.length > 0 && !isIterationResult(visibleResults) ? (
              <Pagination style={{ overflow: "auto" }}>
                {visibleResults.map((_, idx) => (
                  <Pagination.Item
                    key={idx}
                    active={idx === paginationSelection}
                    onClick={() => setPaginationSelection(idx)}
                  >
                    {idx + 1}
                  </Pagination.Item>
                ))}
              </Pagination>
            ) : hasFailedIterationResult(visibleResults) ? (
              `${visibleResults.length} elements failed query`
            ) : (
              "No element failed query"
            )}
          </ListGroup.Item>
        )}
        {(isIterationResult(result) &&
          hasFailedIterationResult(result as Array<any>)) ||
        (typeof result === "object" && !isIterationResult(result)) ? (
          <ListGroup.Item className="flex-fill d-flex align-items-center justify-content-center">
            <Button size="sm" onClick={handleVisualize}>
              Visualize
            </Button>
          </ListGroup.Item>
        ) : (
          typeof result === "boolean" && (
            <ListGroup.Item className="flex-fill d-flex align-items-center justify-content-center">
              {result ? "SAT" : "UNSAT"}
            </ListGroup.Item>
          )
        )}
      </ListGroup>
    </>
  );
}

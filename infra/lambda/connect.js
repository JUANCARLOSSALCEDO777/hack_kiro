// Handler Lambda para gestión de conexiones WebSocket (API Gateway)
// Los connection IDs se almacenan en memoria — persisten mientras el Lambda esté "caliente" (~15 min)
// Tras un cold start el Set se vacía; los clientes se reconectan automáticamente.

const connections = new Set();

exports.handler = async (event) => {
  const { connectionId, routeKey } = event.requestContext;

  switch (routeKey) {
    case '$connect':
      connections.add(connectionId);
      break;

    case '$disconnect':
      connections.delete(connectionId);
      break;

    case 'getConnections':
      // Retorna la lista de connection IDs activos para que el bot haga broadcast
      return {
        statusCode: 200,
        body: JSON.stringify({ connectionIds: [...connections] }),
      };
  }

  return { statusCode: 200, body: 'OK' };
};

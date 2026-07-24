// Handler Lambda para gestión de conexiones WebSocket (API Gateway)
// Los connection IDs se almacenan en memoria — persisten mientras el Lambda esté "caliente"
// LIMITANTE: Si AWS crea múltiples instancias Lambda ante picos de tráfico,
// los clientes registrados en una instancia no recibirán mensajes enviados a otra.
// Para un hackathon con pocos usuarios concurrentes (~20-30) funciona bien.

const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');

const connections = new Set();

exports.handler = async (event) => {
  const { connectionId, routeKey, domainName, stage } = event.requestContext;

  console.log(`[Lambda] Route: ${routeKey}, ConnectionId: ${connectionId}, Total: ${connections.size}`);

  switch (routeKey) {
    case '$connect':
      connections.add(connectionId);
      break;

    case '$disconnect':
      connections.delete(connectionId);
      break;

    case 'sendMessage': {
      // El bot envía un mensaje — broadcast a todos los clientes excepto el emisor
      const endpoint = `https://${domainName}/${stage}`;
      const client = new ApiGatewayManagementApiClient({ endpoint });
      const payload = event.body;

      const staleConnections = [];

      for (const id of connections) {
        if (id === connectionId) continue;

        try {
          await client.send(new PostToConnectionCommand({
            ConnectionId: id,
            Data: payload,
          }));
        } catch (err) {
          if (err.$metadata?.httpStatusCode === 410) {
            staleConnections.push(id);
          }
        }
      }

      for (const id of staleConnections) {
        connections.delete(id);
      }

      break;
    }
  }

  return { statusCode: 200, body: 'OK' };
};

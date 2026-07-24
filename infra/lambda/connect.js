// Handler Lambda para gestión de conexiones WebSocket (API Gateway)
// Connection IDs almacenados en DynamoDB — compartido entre todas las instancias.
// Garantiza broadcast confiable sin importar cuántas instancias Lambda existan.

const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.CONNECTIONS_TABLE;
const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

exports.handler = async (event) => {
  const { connectionId, routeKey, domainName, stage } = event.requestContext;

  switch (routeKey) {
    case '$connect':
      await ddb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { connectionId },
      }));
      break;

    case '$disconnect':
      await ddb.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { connectionId },
      }));
      break;

    case 'sendMessage': {
      // Obtener TODOS los connectionIds de DynamoDB
      const result = await ddb.send(new ScanCommand({ TableName: TABLE_NAME }));
      const connections = result.Items || [];

      const endpoint = `https://${domainName}/${stage}`;
      const client = new ApiGatewayManagementApiClient({ endpoint });
      const payload = event.body;

      const staleIds = [];

      for (const { connectionId: id } of connections) {
        // No reenviar al emisor (el bot)
        if (id === connectionId) continue;

        try {
          await client.send(new PostToConnectionCommand({
            ConnectionId: id,
            Data: payload,
          }));
        } catch (err) {
          // 410 Gone = conexión ya no existe, limpiar
          if (err.$metadata?.httpStatusCode === 410) {
            staleIds.push(id);
          }
        }
      }

      // Limpiar conexiones stale de DynamoDB
      for (const id of staleIds) {
        await ddb.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { connectionId: id },
        }));
      }

      break;
    }
  }

  return { statusCode: 200, body: 'OK' };
};

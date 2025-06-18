// gateway.js
import express from 'express';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { LoadBalancer } from './src/load_balancer.js';
import { microservices } from './services/microservices.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
const PORT = 8080;

// Inicializar balanceador
const balancer = new LoadBalancer(microservices);

// Función para cargar el proto correspondiente a un microservicio
function loadServiceProto(serviceName) {
  const protoPath = path.join(__dirname, `src/protos/${serviceName}.proto`);
  const packageDef = protoLoader.loadSync(protoPath);
  return grpc.loadPackageDefinition(packageDef);
}

// Buscar el cliente gRPC con el método solicitado (ej. GetUser)
function findGrpcClient(proto, methodName) {
  for (const pkgName of Object.keys(proto)) {
    const serviceObj = proto[pkgName];
    for (const [serviceKey, ServiceClass] of Object.entries(serviceObj)) {
      if (
        typeof ServiceClass === 'function' &&
        typeof new ServiceClass('localhost:0', grpc.credentials.createInsecure())[methodName] === 'function'
      ) {
        return ServiceClass;
      }
    }
  }
  return null;
}

// Ruta genérica para ejemplo: GET /users/:id
app.get('/users/:id', (req, res) => {
  const microserviceName = 'user';      // nombre base del proto: user.proto
  const methodName = 'GetUser';         // nombre del método gRPC

  const bestInstance = balancer.selectBestInstance(microserviceName);
  if (!bestInstance) {
    return res.status(503).json({ error: `No hay instancias disponibles para '${microserviceName}'` });
  }

  const proto = loadServiceProto(microserviceName);
  const ClientClass = findGrpcClient(proto, methodName);

  if (!ClientClass) {
    return res.status(500).json({ error: `No se encontró el método ${methodName} en '${microserviceName}.proto'` });
  }

  const client = new ClientClass(
    `${bestInstance.ip}:${bestInstance.port}`,
    grpc.credentials.createInsecure()
  );

  // Realizar la llamada gRPC al microservicio seleccionado
  client[methodName]({ id: req.params.id }, (err, grpcRes) => {
    if (err) {
      console.error(`[gRPC ERROR] ${methodName}:`, err.message);
      return res.status(500).json({ error: 'Error interno en microservicio' });
    }

    res.json({
    data: grpcRes,
    served_by: `${bestInstance.ip}:${bestInstance.port}` // 👈 esto te dice quién respondió
     });
  });
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`🛡️  API Gateway escuchando en http://localhost:${PORT}`);
});

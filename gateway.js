import express from 'express'
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'path';
import { LoadBalancer } from './src/load_balancer.js';
import { microservices } from './services/microservices.js';
const app = express();
app.use(express.json());

const PORT = 8080;

// Load proto de UserService
const USER_PROTO_PATH = path.join(__dirname, 'protos/user.proto');
const userPackageDef = protoLoader.loadSync(USER_PROTO_PATH);
const userProto = grpc.loadPackageDefinition(userPackageDef).user;

// Inicializa el balanceador
const balancer = new LoadBalancer(registry);

// Ruta HTTP que reenvía a microservicio gRPC 'user'
app.get('/users/:id', (req, res) => {
  const bestInstance = balancer.selectBestInstance("user");

  if (!bestInstance) {
    return res.status(503).json({ error: "No hay instancias disponibles para 'user'" });
  }

  const client = new userProto.UserService(
    `${bestInstance.ip}:${bestInstance.port}`,
    grpc.credentials.createInsecure()
  );

  client.GetUser({ id: req.params.id }, (err, grpcRes) => {
    if (err) {
      console.error("Error gRPC:", err.message);
      return res.status(500).json({ error: "Fallo al comunicarse con el microservicio" });
    }

    res.json(grpcRes);
  });
});

app.listen(PORT, () => {
  console.log(`🛡️  API Gateway corriendo en http://localhost:${PORT}`);
});

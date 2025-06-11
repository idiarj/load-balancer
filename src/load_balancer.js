// loadBalancer.js
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.join(__dirname, 'protos/health.proto');

export class LoadBalancer {
  constructor(registry, updateIntervalMs = 3000) {
    this.registry = registry;
    this.metricsInterval = updateIntervalMs;

    const packageDef = protoLoader.loadSync(PROTO_PATH);
    this.healthProto = grpc.loadPackageDefinition(packageDef).health;

    this.startMonitoring();
  }

  getInstanceId(instance) {
    console.loo
    return `${instance.ip}:${instance.port}`;
  }

  startMonitoring() {
    this.updateMetrics(); // primera ejecución inmediata
    setInterval(() => this.updateMetrics(), this.metricsInterval);
  }

  updateMetrics() {
    for (const service of this.registry) {
      for (const instance of service.instances) {
        const client = new this.healthProto.HealthService(
          this.getInstanceId(instance),
          grpc.credentials.createInsecure()
        );

        client.GetMetrics({}, (err, res) => {
          if (err) {
            console.error(`${this.getInstanceId(instance)} no respondió`, err.message);
            instance.metrics = null;
          } else {
            instance.metrics = {
              cpu: res.cpu,
              memusage: res.memusage,
              conns: res.conns
            };
            console.log(`✅ ${this.getInstanceId(instance)} →`, instance.metrics);
          }
        });
      }
    }
  }

  selectBestInstance(microserviceName) {
    const service = this.registry.find(s => s.microservice === microserviceName);
    if (!service) return null;

    const healthy = service.instances.filter(i => i.metrics);
    if (healthy.length === 0) return null;

    return healthy.reduce((best, current) => {
      const s1 = best.metrics.cpu + best.metrics.memusage + best.metrics.conns * 0.01;
      const s2 = current.metrics.cpu + current.metrics.memusage + current.metrics.conns * 0.01;
      return s2 < s1 ? current : best;
    });
  }

  getRegistry() {
    return this.registry;
  }
}
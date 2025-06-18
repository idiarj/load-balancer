// loadBalancer.js
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { metrics as weights } from '../configs/metrics.js'; // <- Importar ponderaciones

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export class LoadBalancer {
  constructor(registry, updateIntervalMs = 3000) {
    this.registry = registry;
    this.metricsInterval = updateIntervalMs;

    const totalWeight = weights.cpu_usage + weights.memory_usage + weights.connections;
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      console.warn("⚠️  Las ponderaciones no suman 1.0. Por favor revisa configs/metrics.js");
    }

    this.startMonitoring();
  }

  getInstanceId(instance) {
    return `${instance.ip}:${instance.port}`;
  }

  loadProto(serviceName) {
    const protoPath = path.join(__dirname, `protos/${serviceName}.proto`);
    const packageDef = protoLoader.loadSync(protoPath);
    return grpc.loadPackageDefinition(packageDef);
  }

  updateMetrics() {
    for (const service of this.registry) {
      const proto = this.loadProto(service.microservice);

      // Buscar el primer servicio que tenga GetMetrics
      let ClientConstructor = null;
      for (const pkgName of Object.keys(proto)) {
        const serviceObj = proto[pkgName];
        for (const [serviceKey, ServiceClass] of Object.entries(serviceObj)) {
          if (
            typeof ServiceClass === 'function' &&
            typeof new ServiceClass('localhost:0', grpc.credentials.createInsecure()).GetMetrics === 'function'
          ) {
            ClientConstructor = ServiceClass;
            break;
          }
        }
        if (ClientConstructor) break;
      }

      if (!ClientConstructor) {
        console.error(`❌ No se encontró un servicio con GetMetrics en '${service.microservice}.proto'`);
        continue;
      }

      for (const instance of service.instances) {
        const client = new ClientConstructor(
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

            const score = this.calculateScore(instance.metrics);
            console.log(
              `${this.getInstanceId(instance)} → CPU: ${res.cpu.toFixed(2)} | MEM: ${res.memusage.toFixed(2)} | CONNS: ${res.conns} | SCORE: ${score.toFixed(4)}`
            );
          }
        });
      }
    }
  }

  calculateScore(metrics) {
    return (
      metrics.cpu * weights.cpu_usage +
      metrics.memusage * weights.memory_usage +
      metrics.conns * weights.connections
    );
  }

  startMonitoring() {
    this.updateMetrics();
    setInterval(() => this.updateMetrics(), this.metricsInterval);
  }

  selectBestInstance(microserviceName) {
    console.log('🔍 Balanceando para microservicio:', microserviceName);
    const service = this.registry.find(s => s.microservice === microserviceName);
    if (!service) return null;

    const healthy = service.instances.filter(i => i.metrics);
    if (healthy.length === 0) return null;

    return healthy.reduce((best, current) => {
      return this.calculateScore(current.metrics) < this.calculateScore(best.metrics)
        ? current
        : best;
    });
  }

  getRegistry() {
    return this.registry;
  }
}

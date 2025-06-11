import { microservices } from './services/microservices.js';
import { LoadBalancer } from './src/load_balancer.js';

const balancer = new LoadBalancer(microservices);

setTimeout(() => {
  const instance = balancer.selectBestInstance("user");
  if (!instance) {
    console.log("❌ No hay instancias saludables");
  } else {
    console.log(`🎯 Mejor instancia para 'user': ${instance.ip}:${instance.port}`);
  }
}, 5000);
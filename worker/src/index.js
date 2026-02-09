// AGI 经济模拟器 - Cloudflare Workers 后端

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS 头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // 路由
    if (url.pathname === '/api/simulate') {
      return handleSimulate(request, env, corsHeaders);
    }
    
    if (url.pathname === '/api/step') {
      return handleStep(request, env, corsHeaders);
    }
    
    if (url.pathname === '/api/history') {
      return handleHistory(request, env, corsHeaders);
    }
    
    if (url.pathname === '/api/reset') {
      return handleReset(request, env, corsHeaders);
    }
    
    return new Response('AGI Economy Simulator API\nEndpoints: /api/simulate, /api/step, /api/history, /api/reset', {
      headers: corsHeaders
    });
  }
};

// 全局状态（Workers 全局变量在请求间保持）
let simulationState = null;

class Simulation {
  constructor(params) {
    this.params = {
      nAgents: params.nAgents || 1000,
      agiBoost: params.agiBoost || 5.0,
      workerRationality: params.workerRationality || 0.4,
      herdEffect: params.herdEffect || 0.5,
      ubi: params.ubi || 0,
      computeTax: params.computeTax || 0,
      workHours: params.workHours || 4,
      ...params
    };
    
    this.step = 0;
    this.agiDeployed = false;
    this.agents = [];
    this.history = {
      steps: [],
      gini: [],
      velocity: [],
      workerHappiness: [],
      capitalistHappiness: []
    };
    
    this.initAgents();
  }
  
  initAgents() {
    this.agents = [];
    const n = this.params.nAgents;
    
    // 工人 80%
    for (let i = 0; i < Math.floor(n * 0.8); i++) {
      this.agents.push({
        id: i,
        type: 'worker',
        wealth: Math.exp(2 + Math.random() * 0.5),
        income: 100 + (Math.random() - 0.5) * 40,
        happiness: 0.6,
        strategy: 'normal'
      });
    }
    
    // 资本家 19.9%
    for (let i = Math.floor(n * 0.8); i < Math.floor(n * 0.999); i++) {
      this.agents.push({
        id: i,
        type: 'capitalist',
        wealth: Math.exp(6 + Math.random() * 1.5),
        income: 500 + (Math.random() - 0.5) * 400,
        happiness: 0.7,
        strategy: 'invest'
      });
    }
    
    // 政府 0.1%
    for (let i = Math.floor(n * 0.999); i < n; i++) {
      this.agents.push({
        id: i,
        type: 'government',
        wealth: 1000000,
        income: 0,
        happiness: 0.5,
        strategy: 'regulate'
      });
    }
  }
  
  calculateGini() {
    const wealths = this.agents.map(a => a.wealth).sort((a, b) => a - b);
    const n = wealths.length;
    const sum = wealths.reduce((a, b) => a + b, 0);
    
    if (sum === 0) return 0;
    
    let cumsum = 0;
    for (let i = 0; i < n; i++) {
      cumsum += wealths[i];
    }
    
    let gini = 0;
    for (let i = 0; i < n; i++) {
      gini += (2 * (i + 1) - n - 1) * wealths[i];
    }
    return gini / (n * sum);
  }
  
  calculateVelocity() {
    const totalWealth = this.agents.reduce((sum, a) => sum + a.wealth, 0);
    const totalIncome = this.agents.reduce((sum, a) => sum + a.income, 0);
    return totalWealth > 0 ? totalIncome / totalWealth * 10 : 0;
  }
  
  runStep() {
    this.step++;
    
    const workers = this.agents.filter(a => a.type === 'worker');
    const capitalists = this.agents.filter(a => a.type === 'capitalist');
    
    // 策略执行
    this.agents.forEach(agent => {
      switch(agent.strategy) {
        case 'save':
          agent.wealth += agent.income * 0.3;
          agent.happiness = Math.max(0, agent.happiness - 0.005);
          break;
        case 'spend':
          if (agent.wealth > 10) {
            agent.wealth *= 0.95;
            agent.happiness = Math.min(1, agent.happiness + 0.01);
          }
          break;
        case 'invest':
          if (agent.type === 'capitalist') {
            agent.wealth *= 1.02;
            agent.income *= 1.002;
          }
          break;
      }
      agent.happiness = Math.max(0, Math.min(1, agent.happiness));
    });
    
    // 应用政策
    if (this.params.ubi > 0 || (this.params.computeTax > 0 && this.agiDeployed)) {
      // UBI
      if (this.params.ubi > 0) {
        workers.forEach(w => {
          w.income += this.params.ubi;
          w.happiness = Math.min(1, w.happiness + 0.005);
        });
      }
      
      // 算力税
      if (this.params.computeTax > 0 && this.agiDeployed) {
        const agiBoost = this.params.agiBoost;
        let taxRevenue = 0;
        
        capitalists.forEach(c => {
          const agiSurplus = c.income * (1 - 1/agiBoost);
          const tax = agiSurplus * this.params.computeTax;
          c.income -= tax;
          c.happiness = Math.max(0, c.happiness - 0.003);
          taxRevenue += tax;
        });
        
        const redistribution = taxRevenue / workers.length;
        workers.forEach(w => {
          w.income += redistribution;
        });
      }
    }
    
    // 记录历史
    if (this.step % 5 === 0) {
      this.history.steps.push(this.step);
      this.history.gini.push(this.calculateGini());
      this.history.velocity.push(this.calculateVelocity());
      
      const wh = workers.reduce((sum, w) => sum + w.happiness, 0) / workers.length;
      const ch = capitalists.reduce((sum, c) => sum + c.happiness, 0) / capitalists.length;
      this.history.workerHappiness.push(wh);
      this.history.capitalistHappiness.push(ch);
    }
  }
  
  deployAGI() {
    this.agiDeployed = true;
    const agiBoost = this.params.agiBoost;
    
    this.agents.forEach(agent => {
      if (agent.type === 'capitalist') {
        agent.income *= agiBoost;
        agent.wealth *= 1.5;
      } else if (agent.type === 'worker') {
        agent.income *= 0.3;
        agent.happiness *= 0.5;
      }
    });
  }
  
  getStats() {
    const workers = this.agents.filter(a => a.type === 'worker');
    const capitalists = this.agents.filter(a => a.type === 'capitalist');
    
    return {
      step: this.step,
      gini: this.calculateGini(),
      velocity: this.calculateVelocity(),
      workerHappiness: workers.reduce((sum, w) => sum + w.happiness, 0) / workers.length,
      capitalistHappiness: capitalists.reduce((sum, c) => sum + c.happiness, 0) / capitalists.length,
      agiDeployed: this.agiDeployed,
      workerCount: workers.length,
      capitalistCount: capitalists.length,
      avgWorkerWealth: workers.reduce((sum, w) => sum + w.wealth, 0) / workers.length,
      avgCapitalistWealth: capitalists.reduce((sum, c) => sum + c.wealth, 0) / capitalists.length
    };
  }
}

async function handleSimulate(request, env, corsHeaders) {
  const body = await request.json().catch(() => ({}));
  
  // 创建或更新模拟
  simulationState = new Simulation(body);
  
  return Response.json({
    success: true,
    message: 'Simulation initialized',
    stats: simulationState.getStats(),
    history: simulationState.history
  }, { headers: corsHeaders });
}

async function handleStep(request, env, corsHeaders) {
  if (!simulationState) {
    return Response.json({ error: 'No simulation running' }, { 
      status: 400, 
      headers: corsHeaders 
    });
  }
  
  const body = await request.json().catch(() => ({}));
  const steps = body.steps || 5;
  
  // 执行多步
  for (let i = 0; i < steps; i++) {
    simulationState.runStep();
  }
  
  // 检查是否部署AGI
  if (body.deployAGI && !simulationState.agiDeployed) {
    simulationState.deployAGI();
  }
  
  const stats = simulationState.getStats();
  
  // 生成事件日志
  const events = [];
  if (stats.gini > 0.7) {
    events.push({ type: 'warning', message: '基尼系数超过0.7，经济不平等严重！' });
  }
  if (stats.velocity < 0.5) {
    events.push({ type: 'warning', message: '货币流通速度过低，消费濒临停滞！' });
  }
  if (stats.gini < 0.5 && stats.velocity > 1.5 && simulationState.agiDeployed) {
    events.push({ type: 'success', message: '系统达到稳态' });
  }
  
  return Response.json({
    success: true,
    stats: stats,
    history: simulationState.history,
    events: events
  }, { headers: corsHeaders });
}

async function handleHistory(request, env, corsHeaders) {
  if (!simulationState) {
    return Response.json({ 
      steps: [], gini: [], velocity: [], 
      workerHappiness: [], capitalistHappiness: [] 
    }, { headers: corsHeaders });
  }
  
  return Response.json(simulationState.history, { headers: corsHeaders });
}

async function handleReset(request, env, corsHeaders) {
  simulationState = null;
  return Response.json({ success: true, message: 'Simulation reset' }, { headers: corsHeaders });
}

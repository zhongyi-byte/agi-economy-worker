// AGI 经济模拟器 - Cloudflare Workers 后端 (Service Worker 格式)

// 全局状态
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

// CORS 头
function getCORSHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

// JSON 响应
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: getCORSHeaders()
  });
}

// 处理模拟初始化
async function handleSimulate(request) {
  try {
    const body = await request.json();
    simulationState = new Simulation(body);
    
    return jsonResponse({
      success: true,
      message: 'Simulation initialized',
      stats: simulationState.getStats(),
      history: simulationState.history
    });
  } catch (e) {
    return jsonResponse({ error: e.message }, 400);
  }
}

// 处理运行步骤
async function handleStep(request) {
  if (!simulationState) {
    return jsonResponse({ error: 'No simulation running' }, 400);
  }
  
  try {
    const body = await request.json();
    const steps = body.steps || 5;
    
    for (let i = 0; i < steps; i++) {
      simulationState.runStep();
    }
    
    if (body.deployAGI && !simulationState.agiDeployed) {
      simulationState.deployAGI();
    }
    
    const stats = simulationState.getStats();
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
    
    return jsonResponse({
      success: true,
      stats: stats,
      history: simulationState.history,
      events: events
    });
  } catch (e) {
    return jsonResponse({ error: e.message }, 400);
  }
}

// 处理历史数据
function handleHistory() {
  if (!simulationState) {
    return jsonResponse({ 
      steps: [], gini: [], velocity: [], 
      workerHappiness: [], capitalistHappiness: [] 
    });
  }
  return jsonResponse(simulationState.history);
}

// 处理重置
function handleReset() {
  simulationState = null;
  return jsonResponse({ success: true, message: 'Simulation reset' });
}

// 主事件监听器
addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // 处理 CORS 预检
  if (request.method === 'OPTIONS') {
    event.respondWith(new Response(null, { headers: getCORSHeaders() }));
    return;
  }
  
  // 路由
  if (url.pathname === '/api/simulate' && request.method === 'POST') {
    event.respondWith(handleSimulate(request));
  } else if (url.pathname === '/api/step' && request.method === 'POST') {
    event.respondWith(handleStep(request));
  } else if (url.pathname === '/api/history') {
    event.respondWith(handleHistory());
  } else if (url.pathname === '/api/reset' && request.method === 'POST') {
    event.respondWith(handleReset());
  } else if (url.pathname === '/') {
    event.respondWith(new Response('AGI Economy Simulator API\n\nEndpoints:\n- POST /api/simulate - 初始化模拟\n- POST /api/step - 运行步骤\n- GET /api/history - 获取历史\n- POST /api/reset - 重置模拟', {
      headers: { 'Content-Type': 'text/plain' }
    }));
  } else {
    event.respondWith(new Response('Not found', { status: 404 }));
  }
});

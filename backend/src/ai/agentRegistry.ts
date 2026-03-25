import type { AgentContext, AgentPlugin } from './types.js';

export class AgentRegistry {
  private readonly plugins: AgentPlugin[];

  constructor(plugins: AgentPlugin[] = []) {
    this.plugins = plugins;
  }

  register(plugin: AgentPlugin) {
    this.plugins.push(plugin);
  }

  listIds() {
    return this.plugins.map((plugin) => plugin.id);
  }

  async runPreProcessors(input: AgentContext): Promise<AgentContext> {
    let ctx = input;
    for (const plugin of this.plugins) {
      if (!plugin.preProcess) continue;
      ctx = await plugin.preProcess(ctx);
    }
    return ctx;
  }

  async runPostProcessors(input: AgentContext): Promise<AgentContext> {
    let ctx = input;
    for (const plugin of this.plugins) {
      if (!plugin.postProcess) continue;
      ctx = await plugin.postProcess(ctx);
    }
    return ctx;
  }
}

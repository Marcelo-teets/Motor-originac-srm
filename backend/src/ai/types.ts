export type CopilotAskInput = {
  companyId: string;
  question: string;
  userId?: string;
  sessionId?: string;
  topK?: number;
};

export type RetrievedReference = {
  id: string;
  content: string;
};

export type CopilotAskOutput = {
  sessionId: string;
  answer: string;
  references: RetrievedReference[];
  agentTrace: string[];
};

export type AgentContext = {
  sessionId: string;
  companyId: string;
  userId?: string;
  question: string;
  baseContext: string;
  retrievedReferences: RetrievedReference[];
  prompt: string;
  answer?: string;
};

export interface LLMGateway {
  generateCompletion(prompt: string, options?: { model?: string; temperature?: number }): Promise<string>;
}

export interface CompanyContextProvider {
  buildCompanyContext(companyId: string): Promise<string>;
}

export interface VectorRetriever {
  search(query: string, topK?: number): Promise<RetrievedReference[]>;
}

export interface AnalystFeedbackRecorder {
  recordFeedback(sessionId: string, userId: string, text: string): Promise<void>;
}

export interface AgentPlugin {
  id: string;
  preProcess?(ctx: AgentContext): Promise<AgentContext>;
  postProcess?(ctx: AgentContext): Promise<AgentContext>;
}

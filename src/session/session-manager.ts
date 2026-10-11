import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { ChatMessage } from '../provider/types.js';

export interface SessionMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  model: string;
  workingDirectory: string;
  messageCount: number;
  tokenCount: number;
}

export interface SessionData extends SessionMetadata {
  messages: ChatMessage[];
}

export class SessionManager {
  private sessionsDir: string;

  constructor(customDir?: string) {
    if (customDir) {
      this.sessionsDir = customDir;
    } else {
      const home = os.homedir();
      this.sessionsDir = path.join(home, '.agent-cli', 'sessions');
    }

    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  public getSessionsDir(): string {
    return this.sessionsDir;
  }

  public generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const rand = crypto.randomBytes(3).toString('hex');
    return `sess-${timestamp}-${rand}`;
  }

  public createSession(params: {
    provider: string;
    model: string;
    workingDirectory: string;
    initialTitle?: string;
  }): SessionData {
    const id = this.generateSessionId();
    const now = new Date().toISOString();
    const session: SessionData = {
      id,
      title: params.initialTitle || 'Nova Sessão',
      createdAt: now,
      updatedAt: now,
      provider: params.provider,
      model: params.model,
      workingDirectory: params.workingDirectory,
      messageCount: 0,
      tokenCount: 0,
      messages: [],
    };
    this.saveSession(session);
    return session;
  }

  public saveSession(session: SessionData): void {
    session.updatedAt = new Date().toISOString();
    session.messageCount = session.messages.length;

    // Se o título for genérico e tiver mensagem de usuário, ajusta o título
    if (session.title === 'Nova Sessão' && session.messages.length > 0) {
      const firstUserMsg = session.messages.find((m) => m.role === 'user');
      if (firstUserMsg && firstUserMsg.content) {
        session.title = firstUserMsg.content.slice(0, 50).trim();
      }
    }

    const filePath = path.join(this.sessionsDir, `${session.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
  }

  public loadSession(id: string): SessionData | null {
    const cleanId = id.endsWith('.json') ? id.replace('.json', '') : id;
    const filePath = path.join(this.sessionsDir, `${cleanId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as SessionData;
    } catch {
      return null;
    }
  }

  public listSessions(): SessionMetadata[] {
    if (!fs.existsSync(this.sessionsDir)) return [];

    const files = fs.readdirSync(this.sessionsDir);
    const sessions: SessionMetadata[] = [];

    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = fs.readFileSync(path.join(this.sessionsDir, f), 'utf-8');
        const parsed = JSON.parse(raw) as SessionData;
        sessions.push({
          id: parsed.id,
          title: parsed.title || 'Sessão sem título',
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt,
          provider: parsed.provider,
          model: parsed.model,
          workingDirectory: parsed.workingDirectory,
          messageCount: parsed.messages ? parsed.messages.length : (parsed.messageCount || 0),
          tokenCount: parsed.tokenCount || 0,
        });
      } catch {
        // Ignora arquivos corrompidos
      }
    }

    // Ordena da mais recente para a mais antiga
    return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public getLatestSession(): SessionData | null {
    const list = this.listSessions();
    if (list.length === 0) return null;
    return this.loadSession(list[0].id);
  }

  public deleteSession(id: string): boolean {
    const cleanId = id.endsWith('.json') ? id.replace('.json', '') : id;
    const filePath = path.join(this.sessionsDir, `${cleanId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }
}

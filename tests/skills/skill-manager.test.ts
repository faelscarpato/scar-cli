import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SkillManager } from '../../src/skills/skill-manager.js';
import { ToolRegistry } from '../../src/tools/registry.js';

describe('SkillManager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skills-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should discover and parse SKILL.md with frontmatter', async () => {
    const skillFolder = path.join(tempDir, '.skills', 'tdd-skill');
    fs.mkdirSync(skillFolder, { recursive: true });

    const skillContent = `---
name: tdd-skill
description: Prática de Test-Driven Development
---
# Instruções de TDD
1. Escreva o teste antes do código.
2. Rode o teste para vê-lo falhar.
3. Implemente a solução mínima.`;

    fs.writeFileSync(path.join(skillFolder, 'SKILL.md'), skillContent, 'utf-8');

    const manager = new SkillManager({
      workspaceDir: tempDir,
      activeSkills: [],
      includeGlobal: false,
    });

    const skills = await manager.discoverSkills();
    expect(skills.length).toBe(1);
    expect(skills[0].name).toBe('tdd-skill');
    expect(skills[0].description).toBe('Prática de Test-Driven Development');
    expect(skills[0].content).toContain('1. Escreva o teste antes do código');
    expect(skills[0].isActive).toBe(false);

    // Toggle activation
    const isNowActive = manager.toggleSkill('tdd-skill');
    expect(isNowActive).toBe(true);
    expect(manager.getActiveSkills().length).toBe(1);

    const injected = manager.getInjectedSkillsPrompt();
    expect(injected.length).toBe(1);
    expect(injected[0].name).toBe('tdd-skill');
    expect(injected[0].content).toContain('Instruções de TDD');
  });

  it('should register skill tools and execute list_skills and read_skill', async () => {
    const skillFolder = path.join(tempDir, '.skills', 'review-skill');
    fs.mkdirSync(skillFolder, { recursive: true });
    fs.writeFileSync(
      path.join(skillFolder, 'SKILL.md'),
      '# Code Review\nRevise atentamente cada diff.',
      'utf-8',
    );

    const manager = new SkillManager({
      workspaceDir: tempDir,
      activeSkills: ['review-skill'],
      includeGlobal: false,
    });

    const registry = new ToolRegistry();
    for (const t of manager.createSkillTools()) {
      registry.register(t);
    }

    const listOutput = await registry.executeTool('list_skills', {});
    expect(listOutput).toContain('review-skill');

    const readOutput = await registry.executeTool('read_skill', { name: 'review-skill' });
    expect(readOutput).toContain('Code Review');
    expect(readOutput).toContain('Revise atentamente');
  });
});

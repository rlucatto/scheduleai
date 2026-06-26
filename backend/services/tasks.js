import fs from 'fs';
import path from 'path';

let mockTasks = [];

// Helper to pre-populate mock tasks relative to today's date
export const initMockTasks = () => {
  const now = new Date();
  
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  mockTasks = [
    {
      id: 'mock-task-1',
      summary: 'Revisar Contrato da Atlas',
      description: 'Análise das cláusulas de rescisão e multas contratuais.',
      estimatedDuration: 90, // minutes
      movable: true,
      cancelable: false,
      priority: 'high',
      blockedBy: [],
      context: ['computer', 'office'],
      requiredEnergy: 'high',
      state: 'planned',
      scheduledTime: null,
      deadline: tomorrow.toISOString()
    },
    {
      id: 'mock-task-2',
      summary: 'Preparar Slides para Reunião',
      description: 'Slides sobre o roadmap do projeto e entregáveis.',
      estimatedDuration: 60,
      movable: true,
      cancelable: true,
      priority: 'medium',
      blockedBy: ['mock-task-1'], // requires contract review first
      context: ['computer'],
      requiredEnergy: 'high',
      state: 'planned',
      scheduledTime: null,
      deadline: tomorrow.toISOString()
    },
    {
      id: 'mock-task-3',
      summary: 'Comprar Medicamentos na Farmácia',
      description: 'Receita médica da consulta passada.',
      estimatedDuration: 20,
      movable: true,
      cancelable: true,
      priority: 'low',
      blockedBy: [],
      context: ['pharmacy', 'outside'],
      requiredEnergy: 'low',
      state: 'planned',
      scheduledTime: null,
      deadline: null
    }
  ];
};

initMockTasks();

export const listTasks = () => {
  return mockTasks;
};

export const getTask = (id) => {
  return mockTasks.find(t => t.id === id);
};

export const insertTask = (taskData) => {
  const newTask = {
    id: `mock-task-${Date.now()}`,
    summary: taskData.summary || 'Nova Tarefa',
    description: taskData.description || '',
    estimatedDuration: Number(taskData.estimatedDuration) || 30,
    movable: taskData.movable !== undefined ? !!taskData.movable : true,
    cancelable: taskData.cancelable !== undefined ? !!taskData.cancelable : true,
    priority: taskData.priority || 'medium',
    blockedBy: taskData.blockedBy || [],
    context: taskData.context || [],
    requiredEnergy: taskData.requiredEnergy || 'medium',
    state: taskData.state || 'planned',
    scheduledTime: taskData.scheduledTime || null,
    deadline: taskData.deadline || null
  };
  mockTasks.push(newTask);
  return newTask;
};

export const updateTask = (id, updatedFields) => {
  const index = mockTasks.findIndex(t => t.id === id);
  if (index !== -1) {
    mockTasks[index] = {
      ...mockTasks[index],
      ...updatedFields
    };
    return mockTasks[index];
  }
  throw new Error('Task not found in mock database');
};

export const deleteTask = (id) => {
  const index = mockTasks.findIndex(t => t.id === id);
  if (index !== -1) {
    mockTasks.splice(index, 1);
    return { success: true };
  }
  throw new Error('Task not found in mock database');
};

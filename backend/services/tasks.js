import fs from 'fs';
import path from 'path';

let mockTasks = [];

// Helper to pre-populate mock tasks relative to today's date
export const initMockTasks = () => {
  mockTasks = [];
};

initMockTasks();

export const listTasks = () => {
  return mockTasks;
};

export const getTask = (id) => {
  return mockTasks.find(t => t.id === id);
};

export const insertTask = (taskData) => {
  let deadline = taskData.deadline || null;
  const isBureaucratic = /dmv|drivers\s*license|motorista|passaporte|passport|imposto|tax|renovar|renew|vence/i.test(taskData.summary || '');
  if (isBureaucratic) {
    if (deadline) {
      const dDate = new Date(deadline);
      if (!isNaN(dDate.getTime())) {
        const comfortDate = new Date(dDate);
        comfortDate.setDate(comfortDate.getDate() - 15);
        if (comfortDate > new Date()) {
          deadline = comfortDate.toISOString().split('T')[0];
          console.log(`[TASKS] Adjusted deadline proactively from ${taskData.deadline} to ${deadline} for task: "${taskData.summary}"`);
        }
      }
    } else {
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 30);
      deadline = defaultDate.toISOString().split('T')[0];
      console.log(`[TASKS] Automatically set proactive deadline of 30 days (${deadline}) for task: "${taskData.summary}"`);
    }
  }

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
    deadline: deadline
  };
  mockTasks.push(newTask);
  return newTask;
};

export const updateTask = (id, updatedFields) => {
  const index = mockTasks.findIndex(t => t.id === id);
  if (index !== -1) {
    let finalFields = { ...updatedFields };
    if (finalFields.summary !== undefined || finalFields.deadline !== undefined) {
      const targetSummary = finalFields.summary !== undefined ? finalFields.summary : mockTasks[index].summary;
      let targetDeadline = finalFields.deadline !== undefined ? finalFields.deadline : mockTasks[index].deadline;
      
      const isBureaucratic = /dmv|drivers\s*license|motorista|passaporte|passport|imposto|tax|renovar|renew|vence/i.test(targetSummary || '');
      if (isBureaucratic && targetDeadline) {
        const dDate = new Date(targetDeadline);
        if (!isNaN(dDate.getTime())) {
          const comfortDate = new Date(dDate);
          comfortDate.setDate(comfortDate.getDate() - 15);
          if (comfortDate > new Date()) {
            finalFields.deadline = comfortDate.toISOString().split('T')[0];
            console.log(`[TASKS] Adjusted updated deadline proactively from ${targetDeadline} to ${finalFields.deadline} for task: "${targetSummary}"`);
          }
        }
      }
    }

    mockTasks[index] = {
      ...mockTasks[index],
      ...finalFields
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

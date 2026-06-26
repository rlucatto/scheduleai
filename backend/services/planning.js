import { listEvents } from './calendar.js';
import { listTasks, insertTask } from './tasks.js';
import { calculateEventTriggers } from './scheduler.js';

// In-memory store for plan versions
// format: { "YYYY-MM-DD": [ { timestamp: Date, timeline: [...] } ] }
let planVersions = {};

// Theme mapping for days of the week
const dailyThemes = {
  1: { name: 'Planejamento', key: 'planning' },      // Monday
  2: { name: 'Reuniões', key: 'meetings' },          // Tuesday
  3: { name: 'Trabalho Profundo', key: 'deepwork' }, // Wednesday
  4: { name: 'Tarefas Externas', key: 'outside' },   // Thursday
  5: { name: 'Revisão e Pendências', key: 'review' } // Friday
};

// Calculate daily time budget and feasibility score (ADHD-friendly)
export const calculateDailyBudget = async (dateStr) => {
  const targetDate = dateStr ? new Date(dateStr) : new Date();
  const dayOfWeek = targetDate.getDay();
  const theme = dailyThemes[dayOfWeek] || null;

  // Set day boundaries (8:00 AM to 10:00 PM)
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(8, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(22, 0, 0, 0);

  const totalAvailableMinutes = 14 * 60; // 14 hours = 840 minutes

  // Retrieve calendar events for this day
  const events = await listEvents(startOfDay.toISOString(), endOfDay.toISOString());
  
  // Retrieve tasks for this day
  const allTasks = listTasks();
  const dailyTasks = allTasks.filter(t => {
    if (!t.scheduledTime) return false;
    const taskDate = new Date(t.scheduledTime);
    return taskDate.toDateString() === targetDate.toDateString();
  });

  let eventsMinutes = 0;
  let prepMinutes = 0;
  let travelMinutes = 0;
  let marginMinutes = 0;
  let hiddenBlocks = [];

  // Calculate times for calendar events and buffers
  for (const event of events) {
    const start = new Date(event.start.dateTime || event.start.date);
    const end = new Date(event.end.dateTime || event.end.date);
    const durationMs = end - start;
    const durationMins = Math.round(durationMs / 60000);
    eventsMinutes += durationMins;

    // Automatic rest margin: 15 minutes of recovery after every meeting
    const recoveryMargin = 15;
    marginMinutes += recoveryMargin;

    // Calculate transit and prep buffers (using existing scheduler math)
    const triggers = await calculateEventTriggers(event);
    let eventPrep = 0;
    let eventTravel = 0;

    if (triggers) {
      eventTravel = Math.round((triggers.travelData?.durationSeconds || 0) / 60);
      eventPrep = 45; // default prep buffer in minutes
      
      travelMinutes += eventTravel * 2; // Ida e Volta
      prepMinutes += eventPrep;

      const departureTime = new Date(start.getTime() - (eventTravel * 60 * 1000));
      const prepStartTime = new Date(departureTime.getTime() - (eventPrep * 60 * 1000));
      const returnEndTime = new Date(end.getTime() + (eventTravel * 60 * 1000));
      const recoveryEndTime = new Date(returnEndTime.getTime() + (recoveryMargin * 60 * 1000));

      hiddenBlocks.push({
        eventId: event.id,
        summary: event.summary,
        prep: { start: prepStartTime.toISOString(), end: departureTime.toISOString(), duration: eventPrep },
        commuteIda: { start: departureTime.toISOString(), end: start.toISOString(), duration: eventTravel },
        event: { start: start.toISOString(), end: end.toISOString(), duration: durationMins },
        commuteVolta: { start: end.toISOString(), end: returnEndTime.toISOString(), duration: eventTravel },
        recovery: { start: returnEndTime.toISOString(), end: recoveryEndTime.toISOString(), duration: recoveryMargin }
      });
    } else {
      const recoveryEndTime = new Date(end.getTime() + (recoveryMargin * 60 * 1000));
      hiddenBlocks.push({
        eventId: event.id,
        summary: event.summary,
        event: { start: start.toISOString(), end: end.toISOString(), duration: durationMins },
        recovery: { start: end.toISOString(), end: recoveryEndTime.toISOString(), duration: recoveryMargin }
      });
    }
  }

  // Calculate task durations
  let tasksMinutes = 0;
  dailyTasks.forEach(t => {
    tasksMinutes += t.estimatedDuration || 30;
  });

  const totalOccupiedMinutes = eventsMinutes + prepMinutes + travelMinutes + tasksMinutes + marginMinutes;
  const remainingMinutes = Math.max(0, totalAvailableMinutes - totalOccupiedMinutes);

  // Compute Feasibility Score
  let score = 100;
  let warnings = [];

  // 1. Overload penalty
  if (totalOccupiedMinutes > totalAvailableMinutes) {
    const excess = totalOccupiedMinutes - totalAvailableMinutes;
    score -= Math.round(excess / 10);
    warnings.push(`Carga horária saturada: compromissos superam o dia em ${Math.round(excess / 60)}h e ${excess % 60}m.`);
  }

  // 2. Meal gap check (Lunch: 12 PM - 2 PM)
  const lunchStart = new Date(targetDate);
  lunchStart.setHours(12, 0, 0, 0);
  const lunchEnd = new Date(targetDate);
  lunchEnd.setHours(14, 0, 0, 0);

  const mealClashes = events.filter(e => {
    const eStart = new Date(e.start.dateTime || e.start.date);
    const eEnd = new Date(e.end.dateTime || e.end.date);
    return (eStart < lunchEnd && eEnd > lunchStart);
  });

  if (mealClashes.length > 1) {
    score -= 15;
    warnings.push('Dia sem horário livre para almoço entre 12h e 14h.');
  }

  // 3. Daily Meetings count check (max 4 per day constraint)
  if (events.length > 4) {
    score -= 15;
    warnings.push(`Limite de reuniões diárias excedido: ${events.length} marcadas (máximo recomendado: 4).`);
  }

  // 4. Consecutive meetings check (max 2 consecutive)
  let consecutiveCount = 0;
  let sortedEvents = [...events].sort((a,b) => new Date(a.start.dateTime) - new Date(b.start.dateTime));
  for (let i = 0; i < sortedEvents.length - 1; i++) {
    const currentEnd = new Date(sortedEvents[i].end.dateTime);
    const nextStart = new Date(sortedEvents[i+1].start.dateTime);
    const gapMins = (nextStart - currentEnd) / 60000;
    if (gapMins < 15) {
      consecutiveCount++;
    } else {
      consecutiveCount = 0;
    }
    if (consecutiveCount >= 2) {
      score -= 10;
      warnings.push('Mais de 2 reuniões consecutivas agendadas sem pausa.');
      break;
    }
  }

  // 5. Late meetings check (no events after 20h / 8 PM)
  const lateEvents = events.filter(e => {
    const eStart = new Date(e.start.dateTime || e.start.date);
    return eStart.getHours() >= 20;
  });
  if (lateEvents.length > 0) {
    score -= 10;
    warnings.push('Alerta de fadiga: Reunião agendada após as 20h.');
  }

  // 6. Thematic Day conflict checks
  if (theme && theme.key === 'deepwork' && events.length > 1) {
    score -= 10;
    warnings.push(`Conflito de Dia Temático: Quarta-feira é focada em ${theme.name}, mas há ${events.length} reuniões marcadas.`);
  }

  // 7. High energy task late check
  const lateHighEnergy = dailyTasks.filter(t => {
    if (t.requiredEnergy !== 'high') return false;
    const taskTime = new Date(t.scheduledTime);
    return taskTime.getHours() >= 18;
  });
  if (lateHighEnergy.length > 0) {
    score -= 10;
    warnings.push('Tarefa complexa de alta energia agendada no período noturno (pós 18h).');
  }

  score = Math.max(0, Math.min(100, score));

  return {
    date: targetDate.toDateString(),
    theme: theme ? theme.name : 'Nenhum',
    budget: {
      totalAvailableMinutes,
      eventsMinutes,
      prepMinutes,
      travelMinutes,
      tasksMinutes,
      marginMinutes,
      totalOccupiedMinutes,
      remainingMinutes
    },
    feasibilityScore: score,
    warnings,
    hiddenBlocks
  };
};

// Intent-based goal planning
export const planGoalIntent = async (goalParams) => {
  const { title, frequency, durationMinutes, preferredPeriod, startDate } = goalParams;
  const start = startDate ? new Date(startDate) : new Date();
  
  const proposals = [];
  const durationMs = (durationMinutes || 60) * 60 * 1000;
  
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    
    if (day.getDay() === 0) continue; // skip Sundays

    const targetStart = new Date(day);
    const targetEnd = new Date(day);
    
    if (preferredPeriod === 'morning') {
      targetStart.setHours(7, 0, 0, 0);
      targetEnd.setHours(11, 0, 0, 0);
    } else if (preferredPeriod === 'afternoon') {
      targetStart.setHours(13, 0, 0, 0);
      targetEnd.setHours(17, 0, 0, 0);
    } else {
      targetStart.setHours(18, 0, 0, 0);
      targetEnd.setHours(21, 0, 0, 0);
    }

    const dayEvents = await listEvents(targetStart.toISOString(), targetEnd.toISOString());
    
    let checkTime = new Date(targetStart);
    while (checkTime.getTime() + durationMs <= targetEnd.getTime()) {
      const proposalEnd = new Date(checkTime.getTime() + durationMs);
      
      const hasClash = dayEvents.some(e => {
        const eStart = new Date(e.start.dateTime || e.start.date);
        const eEnd = new Date(e.end.dateTime || e.end.date);
        return (checkTime < eEnd && proposalEnd > eStart);
      });

      if (!hasClash) {
        proposals.push({
          title,
          start: new Date(checkTime),
          end: proposalEnd
        });
        break;
      }
      
      checkTime = new Date(checkTime.getTime() + 30 * 60 * 1000);
    }

    if (proposals.length >= (frequency || 3)) {
      break;
    }
  }

  return proposals;
};

// Reverse planning leading back from a deadline
export const planReverseDeadline = async (deadlineStr, projectTitle) => {
  const deadline = new Date(deadlineStr);
  const steps = [
    { name: 'Ensaio Geral / Validação Final', daysBefore: 1, duration: 60, energy: 'medium' },
    { name: 'Revisão e Ajustes', daysBefore: 2, duration: 90, energy: 'high' },
    { name: 'Montagem dos Slides / Escrita', daysBefore: 3, duration: 120, energy: 'high' },
    { name: 'Coleta de Dados / Rascunho Inicial', daysBefore: 5, duration: 180, energy: 'high' }
  ];

  const scheduledSteps = [];
  
  for (const step of steps) {
    const stepDate = new Date(deadline);
    stepDate.setDate(stepDate.getDate() - step.daysBefore);
    stepDate.setHours(10, 0, 0, 0);

    if (stepDate.getDay() === 0) {
      stepDate.setDate(stepDate.getDate() - 2);
    } else if (stepDate.getDay() === 6) {
      stepDate.setDate(stepDate.getDate() - 1);
    }

    const task = insertTask({
      summary: `[${projectTitle}] - ${step.name}`,
      description: `Etapa de planejamento reverso para conclusão do projeto até ${deadline.toLocaleString()}`,
      estimatedDuration: step.duration,
      priority: 'high',
      requiredEnergy: step.energy,
      scheduledTime: stepDate.toISOString(),
      deadline: deadline.toISOString()
    });

    scheduledSteps.push(task);
  }

  return scheduledSteps;
};

// Compare Days Assistant
export const compareSchedulingDays = async (day1Str, day2Str) => {
  const budget1 = await calculateDailyBudget(day1Str);
  const budget2 = await calculateDailyBudget(day2Str);

  const score1 = budget1.feasibilityScore;
  const score2 = budget2.feasibilityScore;

  let recommendation = '';
  if (score1 > score2) {
    recommendation = `Recomendo agendar no dia ${day1Str} (${budget1.theme}). Esse dia tem viabilidade de ${score1}% contra ${score2}% de ${day2Str} (${budget2.theme}). O dia ${day1Str} apresenta menor congestionamento e menor risco de atraso.`;
  } else if (score2 > score1) {
    recommendation = `Recomendo agendar no dia ${day2Str} (${budget2.theme}). Esse dia tem viabilidade de ${score2}% contra ${score1}% de ${day1Str} (${budget1.theme}). O dia ${day2Str} possui maior número de intervalos e menos carga total de reuniões.`;
  } else {
    recommendation = `Ambos os dias têm viabilidade parecida (${score1}%). O dia ${day1Str} (${budget1.theme}) possui ${budget1.budget.remainingMinutes}m livres e ${day2Str} (${budget2.theme}) possui ${budget2.budget.remainingMinutes}m livres. Escolha conforme a sua conveniência pessoal.`;
  }

  return {
    day1: { date: day1Str, score: score1, remainingMinutes: budget1.budget.remainingMinutes, warnings: budget1.warnings },
    day2: { date: day2Str, score: score2, remainingMinutes: budget2.budget.remainingMinutes, warnings: budget2.warnings },
    recommendation
  };
};

// Plan Versions Management (Original vs Recovered versions)
export const backupPlanVersion = (dateStr, timelineState) => {
  const dateKey = dateStr || new Date().toISOString().split('T')[0];
  if (!planVersions[dateKey]) {
    planVersions[dateKey] = [];
  }
  const newVersion = {
    timestamp: new Date().toISOString(),
    versionIndex: planVersions[dateKey].length,
    timeline: timelineState
  };
  planVersions[dateKey].push(newVersion);
  return newVersion;
};

export const getPlanVersions = (dateStr) => {
  const dateKey = dateStr || new Date().toISOString().split('T')[0];
  return planVersions[dateKey] || [];
};

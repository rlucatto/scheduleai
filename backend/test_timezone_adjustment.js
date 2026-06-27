import { setPreferences } from './services/scheduler.js';
import { getTimezoneFromCoords } from './services/travel.js';
import { getTimezoneString, enrichEventsWithLocalTime } from './services/gemini.js';
import { insertEvent } from './services/calendar.js';

async function runTests() {
  console.log('=== INICIANDO TESTES DE AJUSTE DE FUSO HORÁRIO ===\n');

  // Teste 1: Resolução de Timezone por Coordenadas / Endereço
  console.log('Teste 1: Resolvendo timezone para Chicago...');
  const chicagoTz = await getTimezoneFromCoords('4544 N Spaulding Ave, Chicago');
  console.log(`Timezone de Chicago resolvido: ${chicagoTz}`);
  if (chicagoTz !== 'America/Chicago') {
    throw new Error(`Timezone incorreto para Chicago: esperado America/Chicago, obtido ${chicagoTz}`);
  }
  console.log('✅ Teste 1 passou!\n');

  console.log('Teste 2: Resolvendo timezone para São Paulo...');
  const spTz = await getTimezoneFromCoords('Avenida Paulista, 1000, São Paulo');
  console.log(`Timezone de São Paulo resolvido: ${spTz}`);
  if (spTz !== 'America/Sao_Paulo') {
    throw new Error(`Timezone incorreto para São Paulo: esperado America/Sao_Paulo, obtido ${spTz}`);
  }
  console.log('✅ Teste 2 passou!\n');

  // Teste 3: Conversão de Timezone para offset UTC
  console.log('Teste 3: Verificando offset formatado para America/Chicago...');
  const chicagoOffset = getTimezoneString('America/Chicago');
  console.log(`Offset de Chicago: ${chicagoOffset}`);
  if (!chicagoOffset.startsWith('UTC-0')) {
    throw new Error(`Offset incorreto para Chicago: obtido ${chicagoOffset}`);
  }
  console.log('✅ Teste 3 passou!\n');

  console.log('Teste 4: Verificando offset formatado para America/Sao_Paulo...');
  const spOffset = getTimezoneString('America/Sao_Paulo');
  console.log(`Offset de São Paulo: ${spOffset}`);
  if (spOffset !== 'UTC-03:00') {
    throw new Error(`Offset incorreto para São Paulo: esperado UTC-03:00, obtido ${spOffset}`);
  }
  console.log('✅ Teste 4 passou!\n');

  // Teste 5: Enriquecimento de eventos com fuso horário da localização
  console.log('Teste 5: Testando enrichEventsWithLocalTime...');
  
  // Define a localização do usuário como Chicago nas preferências
  setPreferences({ origin: '4544 N Spaulding Ave, Chicago' });
  
  // Evento às 10:00 UTC (10h UTC = 5h da manhã em Chicago / 7h da manhã em SP)
  const mockEvents = [
    {
      id: 'evt-1',
      summary: 'Reunião Matinal',
      start: { dateTime: '2026-06-27T10:00:00Z' },
      end: { dateTime: '2026-06-27T11:00:00Z' }
    }
  ];

  const enriched = await enrichEventsWithLocalTime(mockEvents);
  console.log('Evento enriquecido:', JSON.stringify(enriched, null, 2));
  
  // Para Chicago, 10h UTC deve ser formatado como 05:00
  if (!enriched[0].inicioLocal.includes('05:00')) {
    throw new Error(`Formatação de data local incorreta para Chicago. Esperado contendo "05:00", obtido "${enriched[0].inicioLocal}"`);
  }
  console.log('✅ Teste 5 passou!\n');

  // Teste 6: Inserção de evento no mock com timezone correto
  console.log('Teste 6: Inserindo evento de teste em Chicago...');
  const inserted = await insertEvent({
    summary: 'Evento de Teste Chicago',
    start: { dateTime: '2026-06-27T14:00:00' }, // Sem fuso horário especificado
    end: { dateTime: '2026-06-27T15:00:00' }
  });
  console.log('Evento inserido:', JSON.stringify(inserted, null, 2));
  if (inserted.start.timeZone !== 'America/Chicago') {
    throw new Error(`Fuso horário incorreto aplicado ao evento inserido. Esperado America/Chicago, obtido ${inserted.start.timeZone}`);
  }
  console.log('✅ Teste 6 passou!\n');

  console.log('=== TODOS OS TESTES PASSARAM COM SUCESSO! ===');
}

runTests().catch(err => {
  console.error('❌ Teste falhou:', err);
  process.exit(1);
});

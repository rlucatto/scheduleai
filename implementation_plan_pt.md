# Plano de Implantação: Assistente de Agenda com IA (ScheduleAI)

Este plano descreve a arquitetura, as fases de desenvolvimento e a especificação detalhada do **ScheduleAI**, um assistente de rotina e produtividade proativo integrado ao Google Calendar, Maps, Gmail e Drive. O diferencial do ScheduleAI está no gerenciamento da agenda através de três camadas (**Planejar**, **Acompanhar** e **Recuperar**), estruturadas em **6 Motores Core**.

---

## 1. Visão Geral da Arquitetura e os 6 Motores

Para garantir modularidade, facilidade de testes e continuidade, o ScheduleAI é dividido em seis motores independentes que se comunicam através de um Núcleo Orquestrador:

```
+---------------------------------------------------------------------------------+
|                                 SCHEDULEAI CORE                                 |
+---------------------------------------------------------------------------------+
|   MOTOR DE CONVERSA  |   MOTOR DE AGENDA   |  MOTOR DE EXECUÇÃO  |  M. SEGURANÇA|
| (Parsing / Voz / CN) | (OAuth / Calendars) |  (Tarefas / Foco)   | (Permissões) |
+----------------------+---------------------+---------------------+--------------+
|                         MOTOR DE CONTEXTO  |   MOTOR DE MEMÓRIA                 |
|                         (Maps / Geoloc/Mail)| (Preferências / Aprendizagem)     |
+---------------------------------------------------------------------------------+
```

### A. Motor de Conversa (Conversation Engine)
Responsável por processar e entender as mensagens e comandos de voz do usuário, mantendo a continuidade do contexto.
*   **Extração Semântica**: Converte comandos naturais em intenções estruturadas (JSON).
*   **Continuidade entre Conversas**: Mantém o contexto de diálogos anteriores. Se o usuário disser *"Pode mover para quinta"*, o motor compreende que se trata da tarefa sugerida na mensagem anterior.
*   **Confirmação contra Erros de Voz**: Para comandos críticos por áudio, o assistente repete os dados essenciais para confirmação: *"Entendi: cancelar a consulta de terça às 14h. Confirmar? [Sim] [Ajustar]"*.
*   **Personalidades de Comunicação**: Permite selecionar o estilo (Direto, Gentil, Motivador, Firme, Profissional, Minimalista).

### B. Motor de Agenda (Calendar Engine)
Gerencia compromissos, disponibilidade física e regras de ocupação de tempo.
*   **Múltiplos Calendários**: Sincroniza e une agendas pessoais, corporativas, familiares e de projetos, permitindo definir permissões de leitura/edição e privacidade por calendário.
*   **Assistente de Escolha de Duração**: Ao criar eventos sem duração explícita, a IA analisa o histórico e sugere: *"Consultas semelhantes costumam ocupar 1h30 com deslocamento. Deseja reservar esse tempo?"*.

### C. Motor de Execução (Execution Engine)
Controla tarefas (to-dos), hábitos, estados de foco e rituais de início/fim de dia.
*   **Metadados de Tarefas**: Metadados avançados de prioridade, estimativa de duração, dependências (blockers), contextos e nível de esforço de energia.
*   **Modo "Começar o Dia"**: Resumo matinal consolidado (ex: *"Hoje você tem 3 prioridades, primeiro evento às 10h. Precisa sair às 9h20"*).
*   **Modo "Encerrar o Dia"**: Ritual noturno para marcar tarefas concluídas, mover pendências vencidas, preparar o dia seguinte e ativar período silencioso.
*   **Assistente de Hábitos**: Acompanha hábitos de forma flexível e baseada em consistência, não em punição (*"Você não conseguiu caminhar ontem. Quer encaixar hoje ou manter somente o próximo horário?"*).
*   **Proteção contra Esquecimento de Retorno**: Quando uma tarefa longa é pausada, o motor grava a seção exata e o próximo passo para evitar perda de foco (ex: *"Você pausou a revisão na seção 4. O próximo passo é verificar a cláusula de cancelamento"*).

### D. Motor de Contexto (Context Engine)
Conecta o assistente à localização física, trânsito em tempo real, clima e informações do Gmail/Drive.
*   **Fórmula Determinística do Horário de Saída**:
    $$\text{Saída} = \text{Início} - \text{Deslocamento (Maps)} - \text{Margem Segurança} - \text{Estacionamento} - \text{Caminhada}$$
*   **Reserva Automática de Margem**: Protege espaços vazios entre compromissos (alimentação, banheiro, descanso mental) marcando-os como indisponíveis sem poluir o calendário principal.
*   **Compromissos Condicionais**: Suporta planos condicionados a variáveis (caminhar caso não chova, ir ao mercado caso esteja perto, ligar caso seja horário comercial).
*   **Detecção de Oportunidade**: Sugere tarefas se houver brechas repentinas (ex: *"Sua reunião terminou 30 min mais cedo. Você tem tempo para pagar a conta pendente"*).
*   **Registro Rápido de Contexto**: Atalhos por texto ou voz para atualizar o dia (*"Cheguei"*, *"Estou preso no trânsito"*, *"A reunião acabou"*).
*   **Viagem e Itinerários**: Modelos de preparação progressiva de longa data (7 dias antes: verificar documentos; 1 dia antes: bagagem; 2 horas antes: sair).

### E. Motor de Memória (Memory Engine)
Aprende hábitos e registra preferências sem tomar decisões silenciosas perigosas.
*   **Onboarding Inteligente**: Coleta dados cruciais (horários de sono, meios de transporte, margem de atraso) gradualmente por pequenas perguntas na primeira semana, em vez de formulários extensos.
*   **Período de Aprendizagem (Modo Observador)**: Nas primeiras semanas, monitora atrasos reais, desvios e sugere ajustes finos nas margens padrão (*"Você costuma sair 10 min depois do horário sugerido. Deseja aumentar sua margem padrão?"*).
*   **Rotinas Adaptativas**: Realoca metas flexíveis perdidas (ex: academia) sugerindo novos espaços na semana se a agenda mudar (*"Você perdeu o treino de terça. Há espaço na quinta às 18h ou sábado às 10h"*).
*   **Detecção de Mudança de Rotina**: Percebe alterações graduais de comportamento e propõe atualizações de preferências: *"Nas últimas 3 semanas, você começou a trabalhar mais tarde. Deseja atualizar seu horário padrão?"*.

### F. Motor de Segurança (Security Engine)
Garante a privacidade dos dados, controla as permissões concedidas à IA e gerencia logs reversíveis.
*   **Privacidade por Contexto**: Oculta detalhes íntimos da IA externa. O backend envia apenas dados genéricos (ex: *"evento médico privado às 14h"*) para processamento e mantém dados sensíveis localmente.
*   **Modelo de Permissões por Ação**: Controle granular de permissões por comportamento (ler, sugerir, alterar, cancelar, usar localização) por canal (ex: no Telegram só cria tarefas, no Webapp pode alterar reuniões).
*   **Plano Diário com Versões**: Mantém cópias do planejamento diário (plano original, plano após atraso, plano atual) permitindo comparar e restaurar versões.
*   **Histórico e Desfazer (Undo)**: Botão de reversão rápida para qualquer ação proposta ou executada pelo assistente.

---

## 2. Fases de Desenvolvimento e Pipeline de Validação Sequencial

A implementação ocorrerá em 6 fases subsequentes, validadas incrementalmente pelo script `validate_phases.js`.

```
Fase 1 (MVP) -> Fase 2 (Planejar) -> Fase 3 (Acompanhar) -> Fase 4 (Recuperar) -> Fase 5 (Telegram/Voice) -> Fase 6 (Segurança/Demo)
```

### Fase 1: MVP - Base da Agenda [CONCLUÍDO]
*   Estrutura básica de Express + React + Vite.
*   Serviço de trânsito determinístico e agendador básico de buffers (1h/15m).
*   Mock de banco de dados e APIs do Google Calendar.
*   Wrapper de IA Gemini com *Function Calling* básico.
*   Layout React com Glassmorphism e comunicação por Socket.io.

### Fase 2: Camada de Planejamento (Planejar) [Aguardando Autorização de Início]
*   **Banco de Dados Local de Tarefas**: Implementar estrutura de tarefas com metadados (duração, energia, blockers, contextos).
*   **Orçamento Diário, Feasibility Score & Limites de Carga**:
    *   Soma de durações e score de viabilidade diária.
    *   Restrições de sobrecarga: limite de reuniões diárias/consecutivas e bloqueio de almoço.
*   **Bloqueio de Margens e Tempo Oculto**:
    *   Criação de blocos automáticos para preparação, trânsito e buffers de descanso/alimentação.
*   **Planejamento por Intenção & Reverso**:
    *   Lógica para propor metas recorrentes e planejamento reverso de prazos (Deadlines).
*   **Ritual de Início e Fim de Dia**:
    *   Estruturas para rituais "Começar o Dia" e "Encerrar o Dia" (com backup de versões).
*   **Visualização Frontend**: Exibir score de viabilidade diária com alertas de risco no painel de controle e timeline cronológica rica.

### Fase 3: Camada de Acompanhamento (Acompanhar)
*   **Máquina de Estados Real vs. Planejado**: Estados `planejado`, `iniciado`, `pausado`, `concluido`.
*   **Check-ins Ativos & Retorno de Tarefas**:
    *   Timers interativos e notificações push para início e progresso de tarefas.
    *   Registro de seção de pausa para tarefas complexas para evitar esquecimento de retorno.
*   **Continuidade e Personalidades no Motor de Conversa**:
    *   Histórico e controle de contexto semântico.
    *   Ajustes de tom e personalidades do assistente.
*   **Gestão de Espera, Delegação & Promessas**:
    *   Mapeamento de tarefas delegadas e pendências de terceiros.
    *   Detecção de promessas verbais no chat.

### Fase 4: Camada de Recuperação (Recuperar)
*   **Modo Baixa Energia & Modo Interrupção**:
    *   Algoritmos determinísticos para postergar flexíveis e limpar a agenda por 2 horas.
*   **Compromissos Condicionais & Detecção de Oportunidades**:
    *   Integração com previsões externas e alertas por proximidade geográfica.
*   **Aprendizado da Memória (Observador)**:
    *   Fase de Onboarding inteligente incremental.
    *   Modo de observação inicial para aprender velocidade real do usuário e sugerir novos buffers.

### Fase 5: Canal Telegram e Integração de Voz
*   **Telegram Bot Webhooks & Inline Keyboards**:
    *   Botões de ação rápida no chat do Telegram.
*   **Mensagens de Voz & Confirmações**:
    *   Transcrição automática de áudio com confirmação de segurança obrigatória para ações sensíveis.
*   **Compartilhamento de Localização**:
    *   Cálculo de commute a partir de geolocalização pontual/ao vivo.

### Fase 6: Segurança, Privacidade e Painel Demo
*   **Privacidade por Contexto**: Filtro local para enviar apenas dados anonimizados/privados para a IA externa.
*   **Permissões por Ação**: Configuração de permissões baseada em comportamentos e canais.
*   **Painel de Saúde, Auditoria & Modo Demo**:
    *   Monitor de conexões das integrações.
    *   Modo de simulação robusta para testes completos.
*   **Marketplace de Rotinas e Calendários Compartilhados (Família)**.

---

## 3. Métricas de Sucesso do Produto (Métrica Principal)
O ScheduleAI não visa maximizar o número de tarefas feitas, mas sim:
1. **Pontualidade nos compromissos**: Redução de atrasos.
2. **Minimização de conflitos e sobrecarga**: Menos dias com score de viabilidade crítico (<50%).
3. **Realismo temporal**: Redução da diferença entre o tempo estimado e o real de preparação/deslocamento.
4. **Resiliência a imprevistos**: Rapidez na aceitação do plano de recuperação de rotina.

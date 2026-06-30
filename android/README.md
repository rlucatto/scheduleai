# Android App Widget for ScheduleAI

Este diretório contém os arquivos de código-fonte nativos necessários para incluir um **Widget de Tela Inicial** (Home Screen Widget) no aplicativo Android do ScheduleAI.

O Widget exibe a **Visualização Diária** em tempo real direto na tela inicial do celular, reproduzindo de forma gráfica os tempos de preparação, deslocamento e compromissos com cores e marcas de horários idênticas ao aplicativo web.

---

## Estrutura de Arquivos

Os arquivos fornecidos devem ser copiados para a pasta correspondente do seu projeto Android Studio wrapper (ex: gerado via Capacitor, Cordova ou Nativo):

1. **`AndroidManifest.xml`**
   - Copiar a declaração do `<receiver>` e do `<service>` para dentro da tag `<application>` no seu arquivo `app/src/main/AndroidManifest.xml`.
2. **`schedule_widget_info.xml`**
   - Salvar na pasta `app/src/main/res/xml/schedule_widget_info.xml`. Define as dimensões e parâmetros do Widget.
3. **`schedule_widget.xml`**
   - Salvar na pasta `app/src/main/res/layout/schedule_widget.xml`. Layout visual do Widget contendo o cabeçalho e a imagem dinâmica do cronograma.
4. **`ScheduleWidgetProvider.kt`**
   - Salvar na pasta `app/src/main/java/com/scheduleai/app/ScheduleWidgetProvider.kt`. Controla a atualização, efetua a chamada à API do backend e desenha a linha do tempo em tempo real em um Bitmap.

---

## Como Funciona

1. **Chamada de Rede**: O widget efetua uma chamada HTTP assíncrona para a rota do backend `/api/widget/data`.
2. **Desenho Dinâmico (Canvas)**: O `ScheduleWidgetProvider` calcula as proporções exatas de duração de cada fase (Se arrumar, Deslocamento e Evento) com base no horário de início/fim e renderiza a linha do tempo graficamente em um `Bitmap` nativo usando a classe `Canvas`.
3. **Legendas e Ticks**: Escreve os textos centralizados e as reticências se não couberem, e imprime as marcas de horas na régua inferior.
4. **Visualização**: Atualiza o componente `ImageView` do widget com o bitmap gerado, garantindo compatibilidade perfeita em qualquer celular Android.

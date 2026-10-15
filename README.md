# Microsoft Project 2010 (Clone PT-BR)

Uma réplica funcional e moderna do **Microsoft Project 2010** em idioma **Português do Brasil (PT-BR)**, projetada com base na análise arquitetural de binários nativos realizada pelo [REA (Reverse Engineer Anything)](https://github.com/morluto/rea).

---

## 🚀 Como Iniciar

### Opção 1: Via Script Pronto
Basta dar dois cliques no arquivo:
```cmd
iniciar-ms-project.bat
```
Ele abrirá automaticamente o navegador em `http://localhost:4173`.

### Opção 2: Via Terminal
```bash
npm run dev
# ou
npm run preview
```

---

## 🎯 Funcionalidades Implementadas

### 1. Faixa de Opções (Ribbon) Estilo Office 2010
- **Menu Arquivo (Backstage Verde)**:
  - Novo Projeto, Abrir Projeto (JSON), Salvar (LocalStorage), Exportar XML do MS Project (MSPDI), Exportar JSON, Propriedades do Projeto.
- **Aba Tarefa**:
  - Exibição (Alternar entre Gráfico de Gantt e Planilha de Tarefas).
  - Inserção (Nova Tarefa, Inserir Marco de duração 0, Nova Tarefa Resumo).
  - Agendamento (Agendamento Automático vs Agendado Manualmente).
  - Predefinições de % Concluído (0%, 25%, 50%, 75%, 100%).
  - Hierarquia EAP (Recuar Tarefa para subtarefa, Diminuir Recuo).
  - Dependências (Vincular e Desvincular predecessoras).
  - Exclusão de tarefas selecionadas.
- **Aba Recurso**:
  - Planilha de Recursos Humanos e Materiais com taxas horárias em R$/h, tipos (Trabalho, Material, Custo) e grupos.
- **Aba Projeto**:
  - Diálogo de Informações do Projeto (Título, Gerente, Empresa, Calendário base, Data de status).
  - Definir Linha de Base (Baseline 0).
- **Aba Exibição**:
  - Controle de Zoom (Escala em Dias, Semanas ou Meses).
  - Destacar Caminho Crítico (destaque em vermelho).
  - Linhas de Grade (ligar/desligar).
- **Aba Formato**:
  - Legenda e estilos de barras.

### 2. Planilha de Tarefas (Task Sheet)
- Grid com edição direta nas células:
  - **ID**: Índice numérico 1-based sequencial.
  - **Indicadores**: Ícones de tarefa concluída ou marco.
  - **Modo**: Relógio (Automático) ou Calendário (Manual).
  - **Nome da Tarefa**: Indentação visual hierárquica por nível de EAP/WBS e botão de recolher/expandir fases.
  - **Duração**: Formato em dias úteis (ex: `5 dias`, `0 dias`).
  - **Início e Término**: Datas formatadas no padrão brasileiro (`DD/MM/AAAA`) com datepicker nativo.
  - **Predecessoras**: IDs de tarefas anteriores vinculadas.
  - **Nomes dos Recursos**: Múltiplos recursos atribuídos.
  - **% Concluído**: Barra de progresso visual interna e porcentagem.

### 3. Gráfico de Gantt Interativo
- Escala de tempo dupla (Meses no nível superior, Dias da semana no nível inferior).
- Destaque sombreado de finais de semana (Sábados e Domingos).
- Marcador vertical vermelho da data de "Hoje".
- Barras de tarefas azuis arredondadas com preenchimento interno proporcional ao progresso.
- Barras pretas com colchetes dobrados para baixo para Tarefas Resumo (fases).
- Losangos estilizados a 45 graus para Marcos (Milestones).
- Setas de dependência SVG ortogonais conectando o término da predecessora ao início da sucessora.
- Destaque automático do **Caminho Crítico (CPM)** em vermelho.
- Linha de Base (Baseline) comparativa exibida sob a barra atual.
- Tooltips detalhados ao passar o mouse.
- Sincronização vertical de rolagem em tempo real entre a planilha e o gráfico.
- Divisor de tela arrastável (Splitter) para redimensionar a área de visualização.

### 4. Interoperabilidade com o Microsoft Project Real
- **Exportação para XML (MSPDI)**: O projeto gera arquivos XML em total conformidade com o esquema de dados do Microsoft Project, permitindo abri-lo diretamente no Microsoft Project 2010/2013/2016/2019/365 original!
- **Persistência**: Salvamento automático no navegador (`localStorage`) e atalhos de teclado (`Ctrl+S`, `Ctrl+Z`, `Ctrl+Y`).

# Conexao manual com a Meta

Este procedimento habilita a alternativa por token permanente para workspaces
novos e para workspaces OAuth escolhidos para uma troca controlada. O OAuth
continua sendo a opcao recomendada e aparece primeiro na tela.

## Protecao dos workspaces existentes

- Nao altere nem reconecte o workspace Barbieri.
- Um workspace que possui `MetaIntegration` OAuth nao aceita gravacoes no
  modelo manual enquanto a conexao OAuth estiver ativa.
- O token OAuth existente nao e copiado, rotacionado ou recriptografado.
- Reporting e CAPI desse workspace continuam usando a rota legada atual.
- A troca nunca acontece automaticamente e exige confirmacao explicita dentro
  do workspace selecionado.

## Troca controlada de OAuth para token

Use este fluxo somente no workspace que foi aprovado para mudar de modelo:

1. Confirme que `META_CONNECTION_MODES=oauth,manual` esta ativo.
2. Abra `Integracoes` no workspace correto.
3. Em `Token permanente`, escolha `Desconectar OAuth`.
4. Revise o alerta e digite `DESCONECTAR META`.
5. A plataforma apaga somente os tokens OAuth locais e invalida callbacks OAuth
   pendentes desse workspace.
6. Cadastre e valide imediatamente o token permanente, BM, contas e destino.
7. Execute `Testar conexao` antes de retomar reporting e CAPI.

A operacao preserva eventos, campanhas importadas, auditorias, snapshots,
contas de relatorio e destinos de conversao. Ela nao revoga a autorizacao no
Facebook e nao altera nenhum outro workspace. Entre a desconexao e a ativacao
do token permanente, reporting e CAPI ficam interrompidos.

## Ordem de deploy

1. Mantenha `META_CONNECTION_MODES=oauth` durante a primeira publicacao.
2. Publique a migration `20260714200000_meta_normalized_connections`.
3. Publique API e worker com a mesma versao do codigo.
4. Publique o frontend.
5. Confirme a saude do sync e da CAPI dos workspaces OAuth existentes.
6. Na API e no worker, altere para:

```env
META_CONNECTION_MODES=oauth,manual
```

7. Faca o redeploy da API e do worker. O frontend consulta essa capacidade pela
   API e passa a mostrar a alternativa por token.

Para esconder novamente a entrada manual, restaure
`META_CONNECTION_MODES=oauth` e faca redeploy da API e do worker. Isso nao apaga
configuracoes normalizadas ja salvas.

## Dados necessarios

Prepare, para cada estrutura:

- token permanente do usuario do sistema;
- Business Manager que sera o anunciante;
- uma ou mais contas de anuncio;
- Pixel/Dataset e Pagina do Facebook usados pela CAPI.

O token precisa permitir gerenciamento do negocio e leitura das contas de
anuncio. A plataforma valida identidade, permissoes e acesso aos ativos antes de
salvar a estrutura. O token e criptografado imediatamente e nao pode ser exibido
novamente.

## Configuracao rapida

1. Entre no workspace novo e abra `Integracoes`.
2. Mantenha `Conectar com a Meta` como caminho principal ou abra `Usar token
permanente`.
3. Escolha `Rapida`.
4. Informe um nome para a credencial e cole o token uma unica vez.
5. Selecione BM, contas, Pixel/Dataset e Pagina descobertos pela plataforma.
6. Revise e ative.
7. Execute `Testar conexao`. O teste consulta os ativos, mas nao envia evento de
   conversao.

## Configuracao avancada

Use `Avancada` quando houver varios BMs ou destinos compartilhados:

1. Cadastre um token por estrutura que precise de isolamento.
2. Crie cada conexao escolhendo o token, o BM e suas contas exatas.
3. Para uma matriz, informe o BM proprietario do Pixel/Pagina e salve o destino.
4. Nas conexoes seguintes, reutilize esse destino validado.
5. Quando cada BM tiver ativos proprios, crie um destino dedicado por BM.
6. Use o seletor da conta apenas quando ela precisar substituir o destino padrao
   da conexao.
7. Teste cada BM separadamente antes de iniciar a sincronizacao.

Uma falha de token pausa somente a conexao e as contas vinculadas a ele. O
roteamento de reporting e CAPI exige a correspondencia exata entre workspace,
conta, conexao, credencial e destino; configuracoes ausentes ou ambiguas sao
bloqueadas.

## Rotacao de token

1. Abra a credencial na lista avancada.
2. Escolha a troca de token e confirme a operacao.
3. Cole o novo token uma unica vez.
4. A plataforma valida BM, contas e destinos afetados antes de substituir a
   credencial.

Se qualquer validacao falhar, o token salvo permanece inalterado. Auditorias
registram somente IDs, estado e dados redigidos, nunca o token utilizavel.

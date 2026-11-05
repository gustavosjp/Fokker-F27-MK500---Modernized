# Changelog

Fokker F27-500 Modernized, an add-on for bgaurant's F27-500 v2 (it needs his package; it includes none of his original files).

## v11.5 (2026-11-04)

### English

**New**
- **Optional autothrottle.** Settings on the tablet, the new **A/T** key on the FCP, or a joystick button bound to "Autothrottle Arm" /
  "Autothrottle Disconnect" in the MSFS controls. It holds the speed of the SPD knob; in FLC it uses climb power or idle. The MFD band
  shows A/T SPD, CLB, IDLE or DISC. It never pushes past the Dart's TGT and torque limits or the 80 % lever stop, and moving a lever
  disconnects it.
- **VNAV key** on the FCP, with its lamp: it enables the WT21's VNAV (VFLC, ALTV, PATH), which the F27 panel had no way to switch on.
- **Yaw damper (software)** on the YD key: damps the yaw with the rudder trim and, with the autopilot on, trims the steady sideslip away.
  It adds to your pedals, gives the trim back when it stops and switches itself off if it does not calm the yaw. One click of the key
  puts the simulator's damper and the mod's in the same state. Experimental.
- **SID and STAR as procedures.** The tablet sends them with their altitude constraints (which the WT21's VNAV needs for a descent path)
  when the simulator's database has that name, and says what went as a procedure and what is missing from the database. The new
  "SID/STAR: procedure / points" switch sends plain points, as before. After a send the tablet shows what was sent, and why a send failed.
- **SimBrief OFP viewer** on the tablet: the OFP as the PDF lays it out, in one continuous page, with fuel, weights and the route.
- **FUEL page for the MFD band** (tablet Settings): main and collector tanks, flow and used, in kg or lb.
- **Selected speed on the PFD** (the box and the bug on the tape) also shows outside FLC while the autothrottle is on.

**Improved**
- **Pro Line hardware textures:** 4096 px atlas and a roughness / occlusion map: sharp legends, bevelled keys, glass lamp lenses,
  machined knobs.
- **No font of its own on the tablet:** it uses the simulator's fonts. The symbols that showed as squares (degree sign, middle dot,
  dashes, arrows) are fixed, the list caret and the checklist tick are drawn, and the Home date line no longer sits under the weather
  card. Two unused WT21 font files are no longer shipped.
- **WT21 attitude sensors** read the aircraft's electric attitude indicator source.
- **Tablet "send route" message** says what was sent (airports and runways) and how many points.

**Known limits** (details in the README)
- MSFS 2024 reads the `systems.cfg` of the author's package, not the add-on's. With his file as it is, the simulator's own yaw damper does
  not engage (the mod's software damper covers it), the autopilot bank limit stays at 22° and the autopilot works the elevator trim only.
  Optional, at your own discretion: in **your** copy of his file, `bgt-f27500-v2\SimObjects\Airplanes\Bgt_F27500v2\systems.cfg`,
  section `[AUTOPILOT]` (currently lines 63 and 77), change `max_bank = 22` to `max_bank = 30` and `yaw_damper_gain = 0` to
  `yaw_damper_gain = 0.4`. With the gain above 0 the simulator's yaw damper engages and the mod's stands by. An update of his package
  undoes the change; the mod neither changes nor distributes his file.
- The software yaw damper and the sideslip trim are new and have had little flight time: tell me if the aircraft wanders with the YD on.

### Português

**Novo**
- **Autothrottle opcional.** Ajustes do tablet, a tecla **A/T** do FCP, ou um botão do joystick ligado a "Autothrottle Arm" /
  "Autothrottle Disconnect" nos controles do MSFS. Segura a velocidade do botão SPD; no FLC usa potência de subida ou marcha lenta.
  A faixa do MFD mostra A/T SPD, CLB, IDLE ou DISC. Nunca passa dos limites de TGT e torque do Dart nem do batente de 80 % da manete, e
  mexer numa manete desliga.
- **Tecla VNAV** no FCP, com luz: liga o VNAV do WT21 (VFLC, ALTV, PATH), que o painel do F27 não tinha como ligar.
- **Yaw damper (por software)** na tecla YD: amortece a guinada com o trim de leme e, com o piloto automático ligado, tira a derrapagem
  constante. Soma com os seus pedais, devolve o trim ao parar e se desliga sozinho se não acalmar a guinada. Um clique na tecla leva o
  amortecedor do simulador e o do mod ao mesmo estado. Experimental.
- **SID e STAR como procedimento.** O tablet manda com as restrições de altitude (que o VNAV do WT21 precisa para montar a descida)
  quando o banco do simulador tem aquele nome, e diz o que foi como procedimento e o que falta no banco. A chave nova
  "SID/STAR: procedimento / pontos" manda os pontos soltos, como antes. Depois de enviar, o tablet mostra o que foi mandado e por que
  um envio falhou.
- **Visualizador do OFP do SimBrief** no tablet: o OFP como o PDF, numa página contínua, com combustível, pesos e rota.
- **Página FUEL para a faixa do MFD** (Ajustes do tablet): tanques principais e coletores, fluxo e consumo, em kg ou lb.
- **Velocidade selecionada no PFD** (o quadro e o marcador na fita) também aparece fora do FLC com o autothrottle ligado.

**Melhorado**
- **Texturas do hardware Pro Line:** atlas de 4096 px e mapa de rugosidade / oclusão: legendas nítidas, teclas chanfradas, lâmpadas com
  lente de vidro, botões usinados.
- **Tablet sem fonte própria:** usa as fontes do simulador. Os símbolos que apareciam como quadrados (grau, ponto médio, travessões,
  setas) foram corrigidos, o caret da lista e o check do checklist são desenhados, e a data da Home não fica mais sob o cartão do tempo.
  Dois arquivos de fonte do WT21 que ninguém usa deixaram de ir no pacote.
- **Sensores de atitude do WT21** leem a fonte do indicador de atitude elétrico do avião.
- **Mensagem de envio da rota** no tablet diz o que foi mandado (aeroportos e pistas) e quantos pontos.

**Limites conhecidos** (detalhes no README)
- O MSFS 2024 lê o `systems.cfg` do pacote do autor, não o do add-on. Com o arquivo dele como está, o yaw damper do próprio simulador não
  liga (o amortecedor por software do mod cobre isso), o limite de inclinação do piloto automático fica em 22° e o piloto automático
  ajusta só o trim do profundor. Opcional, por sua conta: na **sua** cópia do arquivo dele,
  `bgt-f27500-v2\SimObjects\Airplanes\Bgt_F27500v2\systems.cfg`, seção `[AUTOPILOT]` (hoje nas linhas 63 e 77), troque
  `max_bank = 22` por `max_bank = 30` e `yaw_damper_gain = 0` por `yaw_damper_gain = 0.4`. Com o ganho acima de 0 o yaw damper do
  simulador liga e o do mod fica parado. Uma atualização do pacote do autor desfaz a mudança; o mod não altera nem distribui o
  arquivo dele.
- O amortecedor por software e o trim de derrapagem são novos e voaram pouco: avise se o avião vagar com o YD ligado.

## v11.4

- Sound: every Modernized variation now points to the author's sound folder (MSFS 2024 did not inherit it). / Som: cada variação
  Modernized aponta para a pasta de som do autor (o MSFS 2024 não a herdava).

## v11.3

- All the Modernized liveries show as liveries of one aircraft in the MSFS 2024 selector. / As pinturas Modernized aparecem como
  pinturas de um só avião no seletor do MSFS 2024.

## v11.0

- First add-on form (`bgt-f27500-modernized`, inherits the author's aircraft through `base_container`); before it the mod was a full
  package. / Primeira forma add-on (herda o avião do autor por `base_container`); antes o mod era um pacote completo.

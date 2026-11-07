# Changelog

Fokker F27-500 Modernized, an add-on for bgaurant's F27-500 v2 (it needs his package; it includes none of his original files).

## v11.6 (2026-11-07)

### English

**Fixed** (thanks for the report on v11.5)
- **Cockpit booklets blank.** Since v11 the add-on left out the font the author's booklet code writes with, so both booklets showed no
  text (reference speeds, limitations, fuel calculator, options). The add-on now ships `Data\Roboto-Regular.ttf` (Google's Roboto,
  Apache 2.0, licence alongside). Only his booklet code reads it: it does not change any MSFS font.
- **Yaw damper oscillating left and right.** v11.5 sent each rudder trim correction at full scale, so every small correction swung the
  trim all the way. It now moves the trim by the intended small amounts, and softer than before (at most 1.5° for the damping, 4° a
  second), with the sideslip correction starting the right way (measured in flight) and the trim given back gently when it stops.
- **Autothrottle power settings.** It now flies the F27's own rpm, from the aircraft's manual and booklets: climb and cruise at
  14,200 rpm at most, descent at 11,000 rpm, the selected speed held in between; no more take-off power or flight idle in FLC. The fuel
  trim stays with you: keep the TGT under 730 °C with it (the MFD band shows A/T TGT while the TGT holds the power back).
- **Autothrottle right after take-off.** Engaged with no speed selected, it took the power off. It now takes the speed of the moment,
  never holds less than 1.3 times the stall speed of the flap setting (A/T MIN on the band), goes to flight idle only in a descent, and
  turning the altitude knob through the aircraft's altitude no longer swings the power.

**New**
- **Booklet app on the tablet:** reference speeds (Vref, V1, VR, V2, V3, VAPP for the weight, temperature, elevation and flaps now),
  speed, engine and general limitations, the fuel calculator, the fuel trim charts with a dot at the outside temperature and pressure
  altitude now, and the booklet options (fuel unit, decals, GPS). The calculator's distance, flight level and destination, and the
  options, are the booklets' own: change them on either side and both show it. "From the OFP" fills the calculator from the SimBrief
  plan.
- **OFP night mode** on the tablet (Night / Day button).

**Known limits**
- The `systems.cfg` note of v11.5 still applies (MSFS 2024 reads the author's file; optional edit in your copy, see the README).
- Between 18,500 and 19,000 kg the author's booklet shows Vref 96 kt; the tablet shows the figure of the booklet's table (101 to 102 kt).
  With a high flight level in hot weather his fuel calculator counts 140 kg for the climb; the tablet uses the table (up to 600 kg).
- The booklet failures (TGT can damage engine, typical and random failures) stay in the booklet: his code keeps them inside.

### Português

**Corrigido** (obrigado pelo relato sobre a v11.5)
- **Livretos do cockpit em branco.** Desde a v11 o add-on deixava de fora a fonte com que o código do livreto do autor escreve, então os
  dois livretos ficavam sem texto (velocidades de referência, limitações, calculadora de combustível, opções). Agora o add-on leva
  `Data\Roboto-Regular.ttf` (Roboto do Google, Apache 2.0, licença junto). Só o código do livreto dele lê esse arquivo: não muda
  nenhuma fonte do MSFS.
- **Yaw damper oscilando para os lados.** A v11.5 mandava cada correção do trim de leme em escala cheia, então qualquer correção pequena
  levava o trim até o fim. Agora o trim anda o pouco que deve, e mais suave que antes (no máximo 1,5° para amortecer, 4° por
  segundo), com a correção da derrapagem começando para o lado certo (medido em voo) e o trim devolvido devagar quando ele para.
- **Potência do autothrottle.** Agora voa os rpm do próprio F27, do manual e dos livretos do avião: subida e cruzeiro em no máximo
  14.200 rpm, descida em 11.000 rpm, e a velocidade selecionada entre eles; nada de potência de decolagem ou marcha lenta no FLC. O fuel
  trim continua com você: mantenha o TGT abaixo de 730 °C com ele (a faixa do MFD mostra A/T TGT enquanto o TGT segura a potência).
- **Autothrottle logo após a decolagem.** Ligado sem velocidade selecionada, ele tirava a potência. Agora pega a velocidade do momento,
  nunca segura menos que 1,3 vez a velocidade de estol do flap em uso (A/T MIN na faixa), só vai à marcha lenta em descida, e girar o
  botão de altitude passando pela altitude do avião não balança mais a potência.

**Novo**
- **App Livreto no tablet:** velocidades de referência (Vref, V1, VR, V2, V3, VAPP para o peso, a temperatura, a elevação e os flaps de
  agora), limites de velocidade, dos motores e gerais, a calculadora de combustível, os gráficos de fuel trim com um ponto na
  temperatura externa e na altitude-pressão de agora, e as opções dos livretos (unidade do combustível, decalques, GPS). Distância, nível
  e destino da calculadora, e as opções, são os dos próprios livretos: mudou de um lado, os dois mostram. "Do OFP" preenche a
  calculadora com o plano do SimBrief.
- **Modo noturno no OFP** do tablet (botão Noite / Dia).

**Limites conhecidos**
- Continua valendo a nota do `systems.cfg` da v11.5 (o MSFS 2024 lê o arquivo do autor; mudança opcional na sua cópia, veja o README).
- Entre 18.500 e 19.000 kg o livreto do autor mostra Vref 96 kt; o tablet mostra o valor da tabela do livreto (101 a 102 kt). Com nível
  de voo alto e calor, a calculadora dele conta 140 kg para a subida; o tablet usa a tabela (até 600 kg).
- As falhas do livreto (TGT pode danificar o motor, falhas típicas e aleatória) ficam no livreto: o código dele as guarda por dentro.

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

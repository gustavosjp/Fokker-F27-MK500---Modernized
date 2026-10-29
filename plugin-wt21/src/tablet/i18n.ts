import { MappedSubscribable, Subject } from '@microsoft/msfs-sdk';

export type Lang = 'pt' | 'en';

/**
 * The tablet's languages in the order of the picker (v10.3: a drop-down, so more translations fit; a new one = a Lang, its STRINGS
 * and a line here): its name in itself and its thousands separator.
 */
export const LANGUAGES: { id: Lang; name: string; thousands: string }[] = [
  { id: 'en', name: 'English', thousands: ',' },
  { id: 'pt', name: 'Português (Brasil)', thousands: '.' },
];

const DATE_NAMES: Record<Lang, { days: string[]; months: string[] }> = {
  pt: {
    days: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
    months: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  },
  en: {
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
};

/** A [year, month, day] date the way the language writes it: "Monday, October 26", "segunda-feira, 26 de outubro". */
export function formatDate(lang: Lang, [y, mo, d]: readonly [number, number, number]): string {
  const n = DATE_NAMES[lang], day = n.days[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()] ?? '', month = n.months[mo - 1] ?? '';
  return lang === 'pt' ? `${day}, ${d} de ${month}` : `${day}, ${month} ${d}`;
}

const STRINGS = {
  pt: {
    tabSummary: 'Resumo', tabGround: 'Solo', tabSettings: 'Ajustes',
    tabFlight: 'Voo',
    tabHome: 'Início', tabWeights: 'Pesos',
    tabSystems: 'Sistemas', sysEngines: 'Motores', sysFuel: 'Combustível', sysElec: 'Elétrico', sysAir: 'Ar e pneumático', engine: 'Motor',
    sysTgtLimit: 'Limite de TGT neste rpm', sysTgtStart: 'Partida: TGT até 930 °C, momentâneo', sysTakeOff: 'decolagem 940 com W/M, 910 sem, 5 min',
    sysLimitsSrc: 'Limites do manual de treinamento de manutenção do F27 (80.20).',
    fsLeftMain: 'TANQUE ESQ.', fsRightMain: 'TANQUE DIR.', fsCollector: 'COLETOR', fsXfeed: 'CRUZADA', fsLp: 'Pressão LP', fsLpShort: 'LP',
    fsTotal: 'Total', fsImbalance: 'Assimetria', fsMaxInFlight: 'máx. em voo', fsHeaters: 'Aquecedores', fsCrossfeed: 'Alimentação cruzada',
    fsPumpsNote: 'Bombas: verde ligada, âmbar com a luz de baixa pressão acesa.', on: 'Lig.', off: 'Desl.',
    elAc: 'CA, inversores e degelo', elWarnings: 'Avisos', elSelector: 'Seletor de energia', elCharging: 'carregando',
    airPress: 'Pressurização', airCabinAlt: 'Altitude da cabine', airCabinRate: 'Razão da cabine', airDiff: 'Diferencial',
    airDump: 'Despressurização', airPneu: 'Pneumático', airPneuMain: 'Normal (trem, direção)', airPneuBrakes: 'Freios',
    airPneuEmerg: 'Emergência', airPneuNote: 'Mínimo antes da decolagem (marca): 1.500 psi na principal e nos freios, 1.750 na emergência. Normal 2.800 a 2.900, alívio a 3.500.',
    airWingDeice: 'Degelo das asas', airAircraftAlt: 'Altitude do avião', airArmed: 'Armada', airDumpOff: 'Normal',
    clEngineLimits: 'Motores (Dart)', wxNrst: 'PRÓX.', wxOrig: 'ORIG', wxDest: 'DEST', wxAltn: 'ALTN',
    wxTemp: 'Temp. / orvalho', wxVis: 'Visibilidade', wxCeiling: 'Teto', wxVariable: 'variável', wxLoading: 'Buscando o METAR...',
    wxNone: 'O simulador não tem METAR deste aeroporto.', wxNoAirport: 'Nenhum aeroporto a menos de 20 nm.', wxError: 'O simulador não respondeu.',
    wxTapRefresh: 'toque para atualizar', pillDoors: 'Portas', pillStairs: 'Escadas', pillCovers: 'Capas',
    coversWarning: 'Capas ou pinos colocados com motor ligado!', pitotCovers: 'Capas de pitot', engineCovers: 'Capas dos motores',
    gearPins: 'Pinos do trem', coversOn: 'Colocadas', coversOff: 'Retiradas', goWeights: 'Abastecer em Pesos ›',
    cabin: 'Cabine', weightsCg: 'Pesos e CG', now: 'Agora', planned: 'Planejado', limit: 'Limite', bow: 'Vazio operacional', payload: 'Carga paga',
    lwNeedsOfp: 'LW precisa do OFP (combustível da etapa)',
    tabChecklist: 'Checklist', tabCharts: 'Cartas',
    clNext: 'Próxima ›', clReset: 'Limpar seção', clResetAll: 'Limpar tudo', clLimitations: 'Limitações',
    chAirport: 'Aeroporto', chPick: 'Toque em Aeroporto e digite o código ICAO.', chGrpAirport: 'Aeroporto', chGrpDep: 'Saída',
    chGrpArr: 'Chegada', chGrpApp: 'Aprox.', chLoading: 'Buscando as cartas...', chNone: 'Este provedor não tem cartas desse aeroporto.',
    chFaaHint: 'As cartas FAA cobrem só os EUA.', chError: 'O simulador não respondeu. Tente de novo.', chEmptyGroup: 'Nenhuma carta neste grupo.',
    chChoose: 'Escolha uma carta na lista.', chPageLoading: 'Abrindo a carta...', chImgError: 'Não foi possível abrir a carta.',
    chDrag: 'arraste para mover', chFull: 'Tela cheia', chList: 'Lista', chFit: 'Ajustar', chNight: 'Noite', chDay: 'Dia',
    loading: 'Carregamento', useOfp: 'Usar SimBrief', onBoard: 'a bordo', loadNeedOfp: 'Busque o OFP na aba Voo para embarcar e abastecer conforme o SimBrief.',
    loadPax: 'Passageiros', loadCargo: 'Bagagem e carga', loadFuel: 'Combustível', modeReal: 'Real', modeInstant: 'Instantâneo',
    board: 'Embarcar', deboard: 'Desembarcar', refuel: 'Abastecer', stopLoad: 'Parar', minutes: 'min', remaining: 'faltam',
    seatsCap: 'O F27 tem 52 assentos: os passageiros além disso ficam fora.', loadOnlyGround: 'Carregamento só no solo e parado.',
    stow: 'Recolher tablet', unstow: 'Trazer tablet', tabletPos: 'Posição do tablet',
    sbNoUser: 'Informe seu usuário ou Pilot ID do SimBrief para trazer o último OFP.',
    sbSetUser: 'Informar usuário', sbChangeUser: 'Trocar usuário', sbUser: 'Usuário SimBrief',
    sbFetch: 'Buscar último OFP', sbFetching: 'Buscando OFP...', sbRefetch: 'Buscar de novo',
    sbErrNet: 'Sem resposta do SimBrief.', sbErr: 'SimBrief respondeu:',
    sbRoute: 'Rota', sbAltn: 'Alternativa', sbDist: 'Distância', sbCruise: 'Cruzeiro', sbEte: 'Tempo em rota',
    sbF50: 'Perfil F50 no SimBrief: no F27 o tempo real fica em torno de 1,4 vez maior (dica do autor).',
    sbFuelWeights: 'Combustível e pesos', sbBlock: 'Bloco', sbTrip: 'Etapa', sbReserve: 'Reserva', sbAltnFuel: 'Alternativa',
    sbPax: 'Passageiros',
    sbSend: 'Enviar rota ao FMS', sbSending: 'Enviando ao FMS', sbSent: 'Rota no FMS:', sbPoints: 'pontos', sbByCoords: 'por coordenadas',
    sbCheckFpln: 'Ela chega como modificação: aperte EXEC no CDU, confira em FPLN e escolha SID, STAR e aproximação em DEP/ARR.',
    sbSendErr: 'Não foi possível enviar a rota.',
    kbOk: 'OK', kbCancel: 'Cancelar',
    weight: 'Peso', total: 'total', maxTakeoff: 'máx. decolagem', cg: 'CG',
    fuel: 'Combustível', left: 'Esq.', right: 'Dir.',
    environment: 'Ambiente', oat: 'Temperatura externa', qnh: 'QNH', wind: 'Vento', calm: 'calmo',
    groundStatus: 'Solo', openGround: 'Abrir Solo',
    doorFwd: 'Porta dianteira', doorCargo: 'Porta de carga', doorAft: 'Porta traseira',
    stairFwd: 'Escada dianteira', stairAft: 'Escada traseira', groundPower: 'Energia externa',
    chocks: 'Calços', chocksIn: 'Colocados', chocksOut: 'Retirados',
    open: 'Aberta', closed: 'Fechada', extended: 'Colocada', stowed: 'Recolhida', connected: 'PARC', disconnected: 'BATT BORD', powerOff: 'ARRET',
    needBrake: 'Energia externa precisa do freio de estacionamento puxado.',
    notOnGround: 'Portas e escadas só no solo e parado.',
    screen: 'Tela', brightness: 'Brilho', screenOff: 'Desligar tela', tapToWake: 'Toque para ligar',
    units: 'Unidades de peso', language: 'Idioma',
    about: 'Sobre', aboutLine1: 'Tablet do F27 · etapa 1',
    aboutLine2: 'Avião: Fokker F27-500 de B. Gaurant · aviônicos: Working Title WT21',
    aboutLine2Classic: 'Avião: Fokker F27-500 de B. Gaurant · cockpit original',
    sbClassicNoFms: 'Cockpit Classic: sem FMS para receber a rota; voe com VOR e ADF.',
    cockpit: 'Cockpit',
    cockpitHint: 'Modernized: aviônicos WT21. Classic: o cockpit original do autor, com o painel de piloto automático dele. Troca no solo, parado.',
    cockpitGround: 'O cockpit só troca no solo, parado.',
    chMap: 'Mapa', chChart: 'Carta', chNoGeo: 'carta sem georreferência, sem avião', chOutside: 'avião fora desta carta', chAreas: 'áreas',
    pushback: 'Pushback', pushCall: 'Chamar rebocador', pushStraight: 'Reto', pushTailLeft: 'Cauda à esq.', pushTailRight: 'Cauda à dir.',
    pushStop: 'Parar', pushing: 'Empurrando, proa', pushOff: 'Rebocador desligado',
    pushHint: 'O rebocador já empurra para trás. Para virar: Cauda à esq./dir. (5° por toque). Parar solta o rebocador.',
    pushCalled: 'Rebocador a caminho…', pushNoNative: 'O simulador não oferece pushback aqui agora.',
    gsxMenu: 'Abrir menu do GSX', gsxHint: 'O GSX está ativo e cuida do pushback: no menu dele, peça o pushback e escolha a direção.',
    gsxOn: 'GSX ativo', gsxAvail: 'Disponível', gsxNotAvail: 'Indisponível', gsxBypassed: 'Dispensado', gsxRequested: 'Pedido',
    gsxPerforming: 'Em andamento', gsxDone: 'Concluído',
    tug: 'Rebocador', pushMode: 'Empurrar', pullMode: 'Puxar', pullStart: 'Puxar', pullStraight: 'Reto', pullLeft: 'Esquerda',
    pullRight: 'Direita', pullStop: 'Parar', pulling: 'Puxando,', pullOff: 'Parado', pullTurnL: 'esq.', pullTurnR: 'dir.',
    pullHint: 'O tablet puxa o avião para a frente a 2 kt, sem rebocador visível. Esquerda/Direita viram o nariz (até 3 passos), Reto endireita, Parar freia até parar.',
    pullBrake: 'Freio de estacionamento puxado: solte-o para puxar.', pullChocks: 'Calços no lugar: retire-os antes de puxar.',
    pullAir: 'Só no solo.', pullFast: 'Parou: o avião passou de 5 kt.', pullTug: 'Um rebocador está empurrando (do simulador ou do GSX).',
    pushBrake: 'Solte o freio de estacionamento para o avião andar.',
  },
  en: {
    tabSummary: 'Summary', tabGround: 'Ground', tabSettings: 'Settings',
    tabFlight: 'Flight',
    tabHome: 'Home', tabWeights: 'Weights',
    tabSystems: 'Systems', sysEngines: 'Engines', sysFuel: 'Fuel', sysElec: 'Electrical', sysAir: 'Air & pneumatics', engine: 'Engine',
    sysTgtLimit: 'TGT limit at this rpm', sysTgtStart: 'Start: TGT 930 °C max, momentary', sysTakeOff: 'take-off 940 wet, 910 dry, 5 min',
    sysLimitsSrc: 'Limits from the F27 maintenance training manual (80.20).',
    fsLeftMain: 'LEFT MAIN', fsRightMain: 'RIGHT MAIN', fsCollector: 'COLLECTOR', fsXfeed: 'X-FEED', fsLp: 'LP pressure', fsLpShort: 'LP',
    fsTotal: 'Total', fsImbalance: 'Imbalance', fsMaxInFlight: 'max. in flight', fsHeaters: 'Fuel heaters', fsCrossfeed: 'Crossfeed',
    fsPumpsNote: 'Pumps: green running, amber with their low pressure light on.', on: 'On', off: 'Off',
    elAc: 'AC, inverters and de-icing', elWarnings: 'Warnings', elSelector: 'Power selector', elCharging: 'charging',
    airPress: 'Pressurization', airCabinAlt: 'Cabin altitude', airCabinRate: 'Cabin rate', airDiff: 'Differential',
    airDump: 'Cabin dump', airPneu: 'Pneumatics', airPneuMain: 'Normal (gear, steering)', airPneuBrakes: 'Brakes',
    airPneuEmerg: 'Emergency', airPneuNote: 'Minimum before take-off (mark): 1,500 psi in the main and brake bottles, 1,750 in the emergency ones. Normal 2,800 to 2,900, relief at 3,500.',
    airWingDeice: 'Wing de-ice', airAircraftAlt: 'Aircraft altitude', airArmed: 'Armed', airDumpOff: 'Normal',
    clEngineLimits: 'Engines (Dart)', wxNrst: 'NRST', wxOrig: 'ORIG', wxDest: 'DEST', wxAltn: 'ALTN',
    wxTemp: 'Temp / dew point', wxVis: 'Visibility', wxCeiling: 'Ceiling', wxVariable: 'variable', wxLoading: 'Fetching the METAR...',
    wxNone: 'The sim has no METAR for this airport.', wxNoAirport: 'No airport within 20 nm.', wxError: 'The simulator did not answer.',
    wxTapRefresh: 'tap to refresh', pillDoors: 'Doors', pillStairs: 'Stairs', pillCovers: 'Covers',
    coversWarning: 'Covers or gear pins in place with an engine running!', pitotCovers: 'Pitot covers', engineCovers: 'Engine covers',
    gearPins: 'Gear pins', coversOn: 'Installed', coversOff: 'Removed', goWeights: 'Refuel in Weights ›',
    cabin: 'Cabin', weightsCg: 'Weights and CG', now: 'Now', planned: 'Planned', limit: 'Limit', bow: 'Operating empty', payload: 'Payload',
    lwNeedsOfp: 'LW needs the OFP (trip fuel)',
    tabChecklist: 'Checklist', tabCharts: 'Charts',
    clNext: 'Next ›', clReset: 'Clear section', clResetAll: 'Clear all', clLimitations: 'Limitations',
    chAirport: 'Airport', chPick: 'Tap Airport and type the ICAO code.', chGrpAirport: 'Airport', chGrpDep: 'Departure',
    chGrpArr: 'Arrival', chGrpApp: 'Approach', chLoading: 'Loading the charts...', chNone: 'This provider has no charts for that airport.',
    chFaaHint: 'FAA charts cover the US only.', chError: 'The simulator did not answer. Try again.', chEmptyGroup: 'No charts in this group.',
    chChoose: 'Choose a chart from the list.', chPageLoading: 'Opening the chart...', chImgError: 'Could not open the chart.',
    chDrag: 'drag to move', chFull: 'Full screen', chList: 'List', chFit: 'Fit', chNight: 'Night', chDay: 'Day',
    loading: 'Loading', useOfp: 'Use SimBrief', onBoard: 'on board', loadNeedOfp: 'Fetch the OFP on the Flight tab to board and refuel as SimBrief planned.',
    loadPax: 'Passengers', loadCargo: 'Bags and freight', loadFuel: 'Fuel', modeReal: 'Real', modeInstant: 'Instant',
    board: 'Board', deboard: 'Deboard', refuel: 'Refuel', stopLoad: 'Stop', minutes: 'min', remaining: 'left',
    seatsCap: 'The F27 has 52 seats: passengers beyond that stay behind.', loadOnlyGround: 'Loading only on the ground, stopped.',
    stow: 'Stow tablet', unstow: 'Bring tablet back', tabletPos: 'Tablet position',
    sbNoUser: 'Enter your SimBrief username or Pilot ID to bring in your latest OFP.',
    sbSetUser: 'Enter user', sbChangeUser: 'Change user', sbUser: 'SimBrief user',
    sbFetch: 'Fetch latest OFP', sbFetching: 'Fetching OFP...', sbRefetch: 'Fetch again',
    sbErrNet: 'No answer from SimBrief.', sbErr: 'SimBrief says:',
    sbRoute: 'Route', sbAltn: 'Alternate', sbDist: 'Distance', sbCruise: 'Cruise', sbEte: 'Time en route',
    sbF50: "F50 profile on SimBrief: the F27 takes about 1.4 times longer (author's tip).",
    sbFuelWeights: 'Fuel and weights', sbBlock: 'Block', sbTrip: 'Trip', sbReserve: 'Reserve', sbAltnFuel: 'Alternate',
    sbPax: 'Passengers',
    sbSend: 'Send route to FMS', sbSending: 'Sending to FMS', sbSent: 'Route in the FMS:', sbPoints: 'points', sbByCoords: 'by coordinates',
    sbCheckFpln: 'It arrives as a modification: press EXEC on the CDU, check FPLN and pick SID, STAR and approach on DEP/ARR.',
    sbSendErr: 'Could not send the route.',
    kbOk: 'OK', kbCancel: 'Cancel',
    weight: 'Weight', total: 'total', maxTakeoff: 'max take-off', cg: 'CG',
    fuel: 'Fuel', left: 'Left', right: 'Right',
    environment: 'Environment', oat: 'Outside air temp.', qnh: 'QNH', wind: 'Wind', calm: 'calm',
    groundStatus: 'Ground', openGround: 'Open Ground',
    doorFwd: 'Front door', doorCargo: 'Cargo door', doorAft: 'Aft door',
    stairFwd: 'Front stairs', stairAft: 'Aft stairs', groundPower: 'Ground power',
    chocks: 'Wheel chocks', chocksIn: 'In place', chocksOut: 'Removed',
    open: 'Open', closed: 'Closed', extended: 'Out', stowed: 'Stowed', connected: 'PARC', disconnected: 'BATT BORD', powerOff: 'ARRET',
    needBrake: 'Ground power needs the parking brake set.',
    notOnGround: 'Doors and stairs only on the ground, stopped.',
    screen: 'Screen', brightness: 'Brightness', screenOff: 'Screen off', tapToWake: 'Tap to wake',
    units: 'Weight units', language: 'Language',
    about: 'About', aboutLine1: 'F27 tablet · stage 1',
    aboutLine2: 'Aircraft: Fokker F27-500 by B. Gaurant · avionics: Working Title WT21',
    aboutLine2Classic: 'Aircraft: Fokker F27-500 by B. Gaurant · original cockpit',
    sbClassicNoFms: 'Classic cockpit: no FMS to send the route to; fly it with the VOR and ADF.',
    cockpit: 'Cockpit',
    cockpitHint: "Modernized: WT21 avionics. Classic: the author's original cockpit, with his autopilot panel. Changes on the ground, stopped.",
    cockpitGround: 'The cockpit changes only on the ground, stopped.',
    chMap: 'Map', chChart: 'Chart', chNoGeo: 'chart not georeferenced, no aircraft', chOutside: 'aircraft outside this chart', chAreas: 'areas',
    pushback: 'Pushback', pushCall: 'Call tug', pushStraight: 'Straight', pushTailLeft: 'Tail left', pushTailRight: 'Tail right',
    pushStop: 'Stop', pushing: 'Pushing, heading', pushOff: 'Tug off',
    pushHint: 'The tug pushes straight back at once. To turn: Tail left/right (5° per tap). Stop releases the tug.',
    pushCalled: 'Tug on its way…', pushNoNative: 'The sim offers no pushback here right now.',
    gsxMenu: 'Open the GSX menu', gsxHint: 'GSX is running and handles the pushback: in its menu, request the pushback and pick the direction.',
    gsxOn: 'GSX running', gsxAvail: 'Available', gsxNotAvail: 'Not available', gsxBypassed: 'Bypassed', gsxRequested: 'Requested',
    gsxPerforming: 'In progress', gsxDone: 'Completed',
    tug: 'Tug', pushMode: 'Push', pullMode: 'Pull', pullStart: 'Pull', pullStraight: 'Straight', pullLeft: 'Left',
    pullRight: 'Right', pullStop: 'Stop', pulling: 'Pulling,', pullOff: 'Stopped', pullTurnL: 'left', pullTurnR: 'right',
    pullHint: 'The tablet pulls the aircraft forward at 2 kt, with no tug to see. Left/Right turn the nose (up to 3 steps), Straight straightens, Stop slows to a stop.',
    pullBrake: 'Parking brake set: release it to pull.', pullChocks: 'Chocks in place: remove them before pulling.',
    pullAir: 'On the ground only.', pullFast: 'Stopped: the aircraft went over 5 kt.', pullTug: 'A tug is pushing (the sim\'s or GSX\'s).',
    pushBrake: 'Release the parking brake for the aircraft to move.',
  },
};

export type StringKey = keyof typeof STRINGS.pt;

/** Live translations: each label is a subscribable that follows the language setting. */
export class I18n {
  /**
   * @param lang The language setting.
   */
  constructor(public readonly lang: Subject<Lang>) { }

  /** The label `key` in the current language, kept up to date. */
  public t(key: StringKey): MappedSubscribable<string> {
    return this.lang.map((l) => STRINGS[l][key]);
  }

  /** The label `key` in the current language, once. */
  public now(key: StringKey): string {
    return STRINGS[this.lang.get()][key];
  }
}

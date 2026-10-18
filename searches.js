/* Public inventory presets; personal profiles can be saved locally or shared. */
const SEARCH_PRESETS = [
  { id:"london-oiart", name:"London / OIART", city:"London, Ontario",
    pois:[{name:"OIART", lat:42.937, lon:-81.215}],
    budgetRent:1000, transport:"car", maxCommute:15,
    mustHaves:["parking","internet","privateBedroom"], dealBreakers:["noParking","sharedBedroom"],
    timing:"", briefPending:false, legacyDrive:true },
  { id:"waterloo", name:"Waterloo", city:"Waterloo, Ontario",
    pois:[{name:"University of Waterloo - EV3", lat:43.4685, lon:-80.539}],
    budgetRent:1400, transport:"active", maxCommute:20,
    mustHaves:["privateBath"], dealBreakers:["sharedBedroom"],
    timing:"", briefPending:false },
  { id:"trent-peterborough", name:"Peterborough / Trent", city:"Peterborough, Ontario",
    pois:[{name:"Trent University - Symons Campus", lat:44.357764, lon:-78.289561}],
    budgetRent:null, transport:"mixed", maxCommute:25,
    mustHaves:[], dealBreakers:[], timing:"November 2026", briefPending:true }
];

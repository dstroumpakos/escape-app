import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { hashPassword } from "./passwordUtils";
import { athensDate } from "./companyStats";

/**
 * Demo data for presentations to escape room companies (demo.unlocked.gr):
 * made-up Greek companies and rooms with generated covers, players with
 * follows, stamps, reviews and posts, job ads, and one company account plus
 * two player accounts to log in with.
 *
 * Runs only on a deployment with the env var DEMO_SEED=1 (set it on the demo
 * deployment only, never on production). Run from the Convex dashboard of the
 * demo: Functions → demoSeed:seed, with the password you want for the three
 * log-in accounts. demoSeed:clear removes everything it made.
 *
 * Every account it makes has an @example.com email (a reserved domain: mail
 * to it never reaches anyone). clear removes only the exact accounts seed
 * makes (listed below), never other @example.com test accounts.
 */

const DOMAIN = "@example.com";
const COMPANY_LOGIN = "labyrinth" + DOMAIN;
const PLAYER_LOGINS = ["maria" + DOMAIN, "nikos" + DOMAIN];
const DAY = 24 * 60 * 60 * 1000;

function guard() {
  if (process.env.DEMO_SEED !== "1") {
    throw new Error("Demo data is off here. Set the env var DEMO_SEED=1 on the demo deployment (never on production).");
  }
}

// Same data on every run: a small seeded random generator.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const svgUrl = (svg: string) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

const THEME_COLORS: Record<string, [string, string, string]> = {
  Horror: ["#2a0606", "#7a0d0d", "☠"],
  Thriller: ["#1a0b1f", "#5c1a4a", "⌖"],
  Mystery: ["#0b1530", "#2b3f7a", "?"],
  Detective: ["#14110a", "#6b5521", "⌕"],
  Puzzle: ["#062124", "#11686b", "✦"],
  Adventure: ["#0d2210", "#2f6b2a", "⛰"],
  Historical: ["#22170a", "#7a5a24", "⚜"],
  "Sci-Fi": ["#050f24", "#1d5f8f", "✺"],
  Paranormal: ["#100a1f", "#45307a", "☾"],
  Fantasy: ["#1b0a24", "#6e2f7a", "✧"],
  Comedy: ["#24160a", "#a3561a", "☺"],
};

/** A dark themed cover: gradient, a big symbol, the room's name and theme. */
function roomCover(title: string, theme: string, seed: number): string {
  const [c1, c2, sym] = THEME_COLORS[theme] ?? ["#120808", "#5a1010", "✦"];
  const r = rng(seed);
  const dots = Array.from({ length: 26 }, () =>
    `<circle cx="${Math.round(r() * 1200)}" cy="${Math.round(r() * 800)}" r="${(r() * 2.2 + 0.4).toFixed(1)}" fill="#fff" opacity="${(r() * 0.35 + 0.05).toFixed(2)}"/>`
  ).join("");
  // Two lines at most for long names
  const words = title.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > 18 && line) { lines.push(line); line = w; } else line = (line + " " + w).trim();
  }
  lines.push(line);
  const textY = lines.length > 1 ? 560 : 600;
  const text = lines.slice(0, 2).map((l, i) =>
    `<text x="600" y="${textY + i * 92}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="84" font-weight="700" fill="#f5ead8">${esc(l)}</text>`
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
<defs><radialGradient id="g" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></radialGradient>
<linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.75"/></linearGradient></defs>
<rect width="1200" height="800" fill="url(#g)"/>${dots}
<text x="600" y="380" text-anchor="middle" font-family="Georgia, serif" font-size="260" fill="#ffffff" opacity="0.16">${sym}</text>
<rect width="1200" height="800" fill="url(#v)"/>${text}
<text x="600" y="${textY + lines.length * 92 + 8}" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" letter-spacing="8" fill="#e8c46a">${esc(theme.toUpperCase())}</text>
</svg>`;
  return svgUrl(svg);
}

/** A round logo with the company's initials. */
function logo(name: string, color: string): string {
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<circle cx="128" cy="128" r="124" fill="${color}"/><circle cx="128" cy="128" r="108" fill="none" stroke="#f5ead8" stroke-opacity="0.35" stroke-width="4"/>
<text x="128" y="150" text-anchor="middle" font-family="Georgia, serif" font-size="88" font-weight="700" fill="#f5ead8">${esc(initials)}</text></svg>`;
  return svgUrl(svg);
}

type CompanySpec = {
  key: string; name: string; email: string; city: string; address: string; color: string;
  lat: number; lng: number; description: string; website: string;
  rooms: { title: string; location: string; theme: string; difficulty: number; fear: "none" | "some" | "high"; price: number; duration: number; min: number; max: number; description: string; story: string; tags: string[]; isNew?: boolean }[];
};

const COMPANIES: CompanySpec[] = [
  {
    key: "labyrinth", name: "Labyrinth Escape", email: COMPANY_LOGIN, city: "Αθήνα", address: "Βεΐκου 42, Κουκάκι", color: "#8f1414",
    lat: 37.9655, lng: 23.7246, website: "https://example.com/labyrinth",
    description: "Τρία δωμάτια στο Κουκάκι, πέντε λεπτά από την Ακρόπολη. Σκηνικά που χτίσαμε με τα χέρια μας, γρίφοι χωρίς λουκέτα-γέμισμα και game masters που ζουν την ιστορία μαζί σας.",
    rooms: [
      { title: "Το Χαμένο Φυλαχτό", location: "Κουκάκι", theme: "Adventure", difficulty: 3, fear: "none", price: 22, duration: 60, min: 2, max: 6, tags: ["Οικογενειακό", "Για αρχάριους"], isNew: true,
        description: "Ένα αρχαίο φυλαχτό εξαφανίστηκε από το μουσείο. Ακολουθήστε τα ίχνη του αρχαιολόγου πριν κλείσει η έκθεση.",
        story: "Ο καθηγητής Αλεξίου άφησε πίσω του ένα σημειωματάριο γεμάτο σύμβολα. Έχετε 60 λεπτά να βρείτε πού έκρυψε το φυλαχτό." },
      { title: "Δωμάτιο 13", location: "Κουκάκι", theme: "Horror", difficulty: 4, fear: "high", price: 26, duration: 75, min: 3, max: 6, tags: ["Ηθοποιός", "Τρόμος"],
        description: "Ένα ξενοδοχείο που έκλεισε το 1974. Το δωμάτιο 13 δεν καθαρίστηκε ποτέ. Με ζωντανό ηθοποιό.",
        story: "Ο τελευταίος ένοικος δεν έκανε ποτέ check-out. Απόψε η πόρτα του δωματίου είναι ανοιχτή για πρώτη φορά." },
      { title: "Η Κλοπή του Αιώνα", location: "Κουκάκι", theme: "Thriller", difficulty: 4, fear: "some", price: 24, duration: 60, min: 2, max: 5, tags: ["Ομαδικό", "Δράση"],
        description: "Το πιο ασφαλές θησαυροφυλάκιο της Αθήνας. Μία ευκαιρία, ένα σχέδιο, καθόλου περιθώριο για λάθη.",
        story: "Ο συνεργός σας σάς έδωσε τα σχέδια και εξαφανίστηκε. Ο συναγερμός ξαναπλώνεται σε 60 λεπτά." },
    ],
  },
  {
    key: "keyhole", name: "Κλειδαρότρυπα Rooms", email: "keyhole" + DOMAIN, city: "Αθήνα", address: "Αγίας Παρασκευής 18, Χαλάνδρι", color: "#5c1a4a",
    lat: 38.0213, lng: 23.7987, website: "https://example.com/keyhole",
    description: "Escape rooms για παρέες και εταιρικές ομάδες στα βόρεια προάστια. Δύο δωμάτια, άνετη αναμονή και φωτογραφία της ομάδας μετά το παιχνίδι.",
    rooms: [
      { title: "Ο Ντετέκτιβ Μαυρίδης", location: "Χαλάνδρι", theme: "Detective", difficulty: 2, fear: "none", price: 20, duration: 60, min: 2, max: 6, tags: ["Για αρχάριους", "Οικογενειακό"],
        description: "Ιδανικό για πρώτη φορά. Λύστε την τελευταία υπόθεση του διάσημου ντετέκτιβ στο γραφείο του.",
        story: "Ο Μαυρίδης εξαφανίστηκε αφήνοντας την πιο δύσκολη υπόθεσή του ανοιχτή πάνω στο γραφείο." },
      { title: "Επιχείρηση Άρης", location: "Χαλάνδρι", theme: "Sci-Fi", difficulty: 4, fear: "none", price: 25, duration: 70, min: 2, max: 6, tags: ["Τεχνολογία", "Ομαδικό"],
        description: "Το διαστημόπλοιο χάνει οξυγόνο. Επισκευάστε τα συστήματα πριν χαθεί η επαφή με τη Γη.",
        story: "Είστε το πλήρωμα της πρώτης ελληνικής αποστολής στον Άρη. Κάτι πήγε πολύ στραβά." },
    ],
  },
  {
    key: "mindtrap", name: "Mind Trap", email: "mindtrap" + DOMAIN, city: "Θεσσαλονίκη", address: "Τσιμισκή 88", color: "#11686b",
    lat: 40.6326, lng: 22.9437, website: "https://example.com/mindtrap",
    description: "Στο κέντρο της Θεσσαλονίκης, με τρία δωμάτια για κάθε γούστο: από ήπιο γρίφο μέχρι σκοτεινό θρίλερ.",
    rooms: [
      { title: "Ο Αλχημιστής", location: "Κέντρο", theme: "Fantasy", difficulty: 3, fear: "none", price: 21, duration: 60, min: 2, max: 6, tags: ["Μαγεία", "Οικογενειακό"],
        description: "Το εργαστήριο του αλχημιστή κρύβει τη συνταγή της αιώνιας ζωής. Αν τη βρείτε, είναι δική σας.",
        story: "Ο δάσκαλός σας λείπει εδώ και μέρες. Η πόρτα του εργαστηρίου ήταν μισάνοιχτη σήμερα το πρωί." },
      { title: "Βαγόνι 404", location: "Κέντρο", theme: "Mystery", difficulty: 3, fear: "some", price: 22, duration: 60, min: 2, max: 5, tags: ["Μυστήριο"],
        description: "Το νυχτερινό τρένο για Βελιγράδι σταμάτησε στη μέση του πουθενά. Ένας επιβάτης λείπει.",
        story: "Όλοι κοιμόντουσαν. Όλοι λένε ότι δεν είδαν τίποτα. Κάποιος λέει ψέματα." },
      { title: "Ψυχιατρείο Λευκόν", location: "Κέντρο", theme: "Horror", difficulty: 5, fear: "high", price: 25, duration: 75, min: 3, max: 6, tags: ["Ηθοποιός", "Τρόμος", "Για έμπειρους"],
        description: "Το πιο τρομακτικό δωμάτιο της πόλης. Μόνο για έμπειρες ομάδες με γερά νεύρα.",
        story: "Το ίδρυμα έκλεισε μετά από ένα περιστατικό που δεν καταγράφηκε ποτέ. Απόψε μπαίνετε για να μάθετε τι έγινε." },
    ],
  },
  {
    key: "corridor", name: "Σκοτεινός Διάδρομος", email: "corridor" + DOMAIN, city: "Θεσσαλονίκη", address: "Εγνατίας 120", color: "#3a1a1a",
    lat: 40.6372, lng: 22.9467, website: "https://example.com/corridor",
    description: "Δωμάτια τρόμου και θρίλερ με ηθοποιούς. Για όσους θέλουν την αδρεναλίνη στο κόκκινο.",
    rooms: [
      { title: "Η Κούκλα", location: "Εγνατία", theme: "Paranormal", difficulty: 4, fear: "high", price: 24, duration: 70, min: 2, max: 5, tags: ["Ηθοποιός", "Τρόμος"],
        description: "Ένα παλιό σπίτι, ένα παιδικό δωμάτιο και μια κούκλα που δεν μένει ποτέ στην ίδια θέση.",
        story: "Η οικογένεια Ραφαηλίδη έφυγε βιαστικά το 1962. Τα παιχνίδια έμειναν. Και κάτι ακόμα." },
      { title: "Υπόγειο 7", location: "Εγνατία", theme: "Thriller", difficulty: 4, fear: "some", price: 23, duration: 60, min: 2, max: 6, tags: ["Δράση"],
        description: "Ξυπνάτε δεμένοι σε ένα υπόγειο. Ο απαγωγέας θα γυρίσει σε μία ώρα.",
        story: "Δεν θυμάστε πώς φτάσατε εδώ. Το μόνο που ξέρετε: ο χρόνος τρέχει." },
    ],
  },
  {
    key: "enigma", name: "Enigma House", email: "enigma" + DOMAIN, city: "Πάτρα", address: "Μαιζώνος 55", color: "#2b3f7a",
    lat: 38.2466, lng: 21.7346, website: "https://example.com/enigma",
    description: "Το πρώτο escape room της Πάτρας, με δωμάτια εμπνευσμένα από την ιστορία της πόλης.",
    rooms: [
      { title: "Το Καρναβάλι", location: "Κέντρο", theme: "Comedy", difficulty: 2, fear: "none", price: 18, duration: 60, min: 2, max: 8, tags: ["Οικογενειακό", "Χιούμορ", "Για αρχάριους"],
        description: "Το άρμα του βασιλιά καρνάβαλου εξαφανίστηκε την παραμονή της παρέλασης. Βρείτε το πριν βγει ο κόσμος στους δρόμους.",
        story: "Η Πάτρα ετοιμάζεται για τη μεγαλύτερη γιορτή της χρονιάς. Μόνο που κάποιος έχει άλλα σχέδια." },
      { title: "Το Ναυάγιο", location: "Λιμάνι", theme: "Historical", difficulty: 3, fear: "none", price: 20, duration: 60, min: 2, max: 6, tags: ["Ιστορικό"],
        description: "Ένα εμπορικό πλοίο του 19ου αιώνα βυθίστηκε έξω από το λιμάνι με ένα μυστικό φορτίο.",
        story: "Ο θησαυρός του καπετάν Λιάρου δεν βρέθηκε ποτέ. Το ημερολόγιο του πλοίου μόλις ήρθε στα χέρια σας." },
    ],
  },
  {
    key: "lostkey", name: "Lost Key", email: "lostkey" + DOMAIN, city: "Ηράκλειο", address: "25ης Αυγούστου 30", color: "#2f6b2a",
    lat: 35.3387, lng: 25.1442, website: "https://example.com/lostkey",
    description: "Escape rooms στην καρδιά του Ηρακλείου, με γρίφους από τη μινωική Κρήτη μέχρι το μέλλον.",
    rooms: [
      { title: "Ο Λαβύρινθος του Μίνωα", location: "Κέντρο", theme: "Historical", difficulty: 4, fear: "some", price: 22, duration: 70, min: 2, max: 6, tags: ["Ιστορικό", "Μυθολογία"],
        description: "Μπείτε στον λαβύρινθο της Κνωσού. Ο Μινώταυρος δεν σας περιμένει, αλλά δεν θα αργήσει.",
        story: "Η Αριάδνη σάς έδωσε τον μίτο. Το μόνο που μένει είναι να βρείτε την έξοδο." },
      { title: "Εργαστήριο Χρόνου", location: "Κέντρο", theme: "Puzzle", difficulty: 3, fear: "none", price: 20, duration: 60, min: 2, max: 5, tags: ["Γρίφοι", "Οικογενειακό"],
        description: "Ένας ωρολογοποιός έφτιαξε μια μηχανή που σταματάει τον χρόνο. Πρέπει να τη σταματήσετε πριν σταματήσει αυτή εσάς.",
        story: "Όλα τα ρολόγια της πόλης σταμάτησαν στις 12:00. Το εργαστήριο είναι το μόνο μέρος που ακόμα χτυπάει." },
    ],
  },
  {
    key: "clockwork", name: "Clockwork Escape", email: "clockwork" + DOMAIN, city: "Λάρισα", address: "Κύπρου 14", color: "#7a5a24",
    lat: 39.6390, lng: 22.4191, website: "https://example.com/clockwork",
    description: "Δωμάτια με μηχανισμούς, γρανάζια και αυτοματισμούς. Χωρίς λουκέτα, μόνο λογική.",
    rooms: [
      { title: "Το Ρολόι του Πύργου", location: "Κέντρο", theme: "Puzzle", difficulty: 4, fear: "none", price: 19, duration: 60, min: 2, max: 6, tags: ["Μηχανισμοί", "Γρίφοι"],
        description: "Ο μηχανισμός του παλιού ρολογιού κρύβει τον κωδικό για το χρηματοκιβώτιο του δημάρχου.",
        story: "Σε 60 λεπτά το ρολόι θα χτυπήσει μεσάνυχτα και ο μηχανισμός θα κλειδώσει για πάντα." },
      { title: "Ο Μάγος", location: "Κέντρο", theme: "Fantasy", difficulty: 2, fear: "none", price: 18, duration: 60, min: 2, max: 6, tags: ["Οικογενειακό", "Για αρχάριους"],
        description: "Η παράσταση του μεγάλου μάγου ξεκινά σε μία ώρα, αλλά ο μάγος έχει εξαφανιστεί μέσα στο ίδιο του το κουτί.",
        story: "Το καμαρίνι του είναι γεμάτο κόλπα. Κάποιο από αυτά θα τον φέρει πίσω." },
    ],
  },
  {
    key: "secret", name: "Μυστικό Δωμάτιο", email: "secret" + DOMAIN, city: "Πειραιάς", address: "Ηρώων Πολυτεχνείου 70", color: "#45307a",
    lat: 37.9420, lng: 23.6465, website: "https://example.com/secret",
    description: "Δίπλα στο λιμάνι του Πειραιά, με δωμάτια για παρέες, πάρτι γενεθλίων και team building.",
    rooms: [
      { title: "Ο Θησαυρός του Λιμανιού", location: "Πειραιάς", theme: "Adventure", difficulty: 3, fear: "none", price: 21, duration: 60, min: 2, max: 7, tags: ["Οικογενειακό", "Ομαδικό"],
        description: "Ένας παλιός λιμενεργάτης άφησε έναν χάρτη. Ο θησαυρός είναι κάπου στην αποθήκη 9.",
        story: "Η αποθήκη θα κατεδαφιστεί αύριο το πρωί. Απόψε είναι η τελευταία ευκαιρία." },
      { title: "Το Εργαστήριο του Δρ. Κ.", location: "Πειραιάς", theme: "Mystery", difficulty: 5, fear: "some", price: 24, duration: 75, min: 2, max: 5, tags: ["Για έμπειρους", "Επιστήμη"],
        description: "Ο πιο δύσκολος γρίφος της Αττικής. Μόνο το 18% των ομάδων έχει βγει.",
        story: "Ο Δρ. Κ. ισχυρίστηκε ότι βρήκε τη λύση σε ένα άλυτο πρόβλημα. Την επόμενη μέρα χάθηκε." },
    ],
  },
];

const PLAYERS: { name: string; city: string; bio: string }[] = [
  { name: "Μαρία Παπαδοπούλου", city: "Αθήνα", bio: "Escape rooms κάθε Παρασκευή με την ίδια παρέα εδώ και 3 χρόνια 🔐" },
  { name: "Νίκος Γεωργίου", city: "Αθήνα", bio: "Λύνω γρίφους, φοβάμαι τα ζόμπι." },
  { name: "Ελένη Κωνσταντίνου", city: "Θεσσαλονίκη", bio: "Horror rooms only. Όσο πιο σκοτεινό, τόσο καλύτερο." },
  { name: "Γιώργος Δημητρίου", city: "Αθήνα", bio: "Team building στη δουλειά, εθισμός στη ζωή." },
  { name: "Κατερίνα Αλεξίου", city: "Πάτρα", bio: "" },
  { name: "Δημήτρης Ιωάννου", city: "Θεσσαλονίκη", bio: "52 δωμάτια μέχρι σήμερα. Στόχος τα 100." },
  { name: "Σοφία Νικολάου", city: "Ηράκλειο", bio: "Ψάχνω πάντα το επόμενο δύσκολο δωμάτιο." },
  { name: "Αλέξανδρος Μιχαηλίδης", city: "Αθήνα", bio: "" },
  { name: "Χριστίνα Βασιλείου", city: "Λάρισα", bio: "Οικογενειακά escape rooms με τα παιδιά 👨‍👩‍👧" },
  { name: "Παναγιώτης Σταύρου", city: "Πειραιάς", bio: "Game master τα Σάββατα, παίκτης τις Κυριακές." },
  { name: "Άννα Θεοδώρου", city: "Θεσσαλονίκη", bio: "" },
  { name: "Κώστας Αντωνίου", city: "Αθήνα", bio: "Speedrunner. Το ρεκόρ μου: 38 λεπτά." },
  { name: "Ιωάννα Μαυρίδου", city: "Αθήνα", bio: "Μυστήρια και ντετέκτιβ, αυτά είναι τα δικά μου." },
  { name: "Στέλιος Καραγιάννης", city: "Ηράκλειο", bio: "" },
];

const REVIEW_TEXTS = [
  "Απίστευτα σκηνικά, από τα καλύτερα που έχουμε δει. Ο game master ήταν φοβερός.",
  "Πολύ έξυπνοι γρίφοι, κανένα λουκέτο για γέμισμα. Το προτείνω ανεπιφύλακτα!",
  "Βγήκαμε με 2 λεπτά να περισσεύουν, η αδρεναλίνη στο κόκκινο 😅",
  "Ιδανικό για πρώτη φορά, η παρέα το λάτρεψε.",
  "Η ατμόσφαιρα ήταν τέλεια, ο ηθοποιός μάς έκανε να ουρλιάζουμε.",
  "Καλό δωμάτιο, λίγο δύσκολο το δεύτερο μέρος αλλά άξιζε.",
  "Από τα καλύτερα της πόλης. Θα ξαναπάμε σίγουρα για το επόμενο δωμάτιό τους.",
  "Ζεστή υποδοχή, καθαρός χώρος και φωτογραφία ομάδας στο τέλος. 10/10.",
  "Πολύ πρωτότυπη ιστορία, ο τελευταίος γρίφος ήταν μαγικός.",
  "Πήγαμε για γενέθλια και ήταν η καλύτερη ιδέα!",
];

const POST_TEXTS = [
  "Βγήκαμε!! 🔓 Με 4 λεπτά να περισσεύουν. Τρομερή ομάδα!",
  "Παρασκευή βράδυ = escape room. Δεν αλλάζει αυτό.",
  "Ποιος θέλει να πάμε το Σάββατο σε κάτι τρομακτικό; Ψάχνω 2 άτομα ακόμα 👻",
  "Πρώτη φορά σε δωμάτιο με ηθοποιό. Δεν ξέρω αν θα ξανακοιμηθώ 😂",
  "Το 10ο δωμάτιο της χρονιάς! Ποιο να δοκιμάσουμε μετά;",
  "Team building με τη δουλειά και τελικά βγήκαμε πρώτοι στο leaderboard της εταιρείας 🏆",
  "Ο τελευταίος γρίφος μάς πήρε 15 λεπτά. Άξιζε κάθε δευτερόλεπτο.",
  "Δεν βγήκαμε... αλλά γελάσαμε όσο ποτέ. Επόμενη φορά!",
];

const RANK = (played: number) =>
  played >= 12 ? "Escape Veteran" : played >= 8 ? "Escape Adventurer" : played >= 4 ? "Escape Explorer" : "Escape Rookie";

async function hasDemo(ctx: MutationCtx) {
  return await ctx.db.query("companies").withIndex("by_email", (q) => q.eq("email", COMPANY_LOGIN)).first();
}

export const seed = internalMutation({
  args: { password: v.string() },
  handler: async (ctx, args) => {
    guard();
    if (args.password.length < 8) throw new Error("Use a password of at least 8 characters.");
    if (await hasDemo(ctx)) throw new Error("Demo data is already here. Run demoSeed:clear first to make it again.");
    // Never make a second account with an email that is already taken
    for (const email of SEEDED_COMPANY_EMAILS) {
      if (await ctx.db.query("companies").withIndex("by_email", (q) => q.eq("email", email)).first()) throw new Error(`A company with ${email} already exists here.`);
    }
    for (const email of SEEDED_USER_EMAILS) {
      if (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).first()) throw new Error(`A player with ${email} already exists here.`);
    }

    const now = Date.now();
    const r = rng(2026);
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const loginHash = await hashPassword(args.password);
    // The other made-up accounts get a random password nobody knows.
    const lockedHash = await hashPassword(crypto.randomUUID() + crypto.randomUUID());

    // ── Companies and rooms ──
    const companyIds: Id<"companies">[] = [];
    const rooms: { id: Id<"rooms">; companyId: Id<"companies">; title: string; image: string }[] = [];
    let seed = 1;
    for (const c of COMPANIES) {
      const companyId = await ctx.db.insert("companies", {
        name: c.name, email: c.email, phone: "+30 210 000 0000", logo: logo(c.name, c.color),
        address: c.address, city: c.city, description: c.description, website: c.website,
        password: c.email === COMPANY_LOGIN ? loginHash : lockedHash,
        verified: true, createdAt: now - 200 * DAY, onboardingStatus: "approved", termsAcceptedAt: now - 200 * DAY,
        platformPlan: "unlimited",
      });
      companyIds.push(companyId);
      for (const room of c.rooms) {
        const image = roomCover(room.title, room.theme, seed++);
        const id = await ctx.db.insert("rooms", {
          title: room.title, location: room.location, image, images: [image],
          rating: 0, reviews: 0, duration: room.duration, difficulty: room.difficulty, maxDifficulty: 5,
          players: `${room.min}-${room.max}`, playersMin: room.min, playersMax: room.max, price: room.price,
          theme: room.theme, fearLevel: room.fear, tags: room.tags, description: room.description, story: room.story,
          isNew: !!room.isNew, isFeatured: r() < 0.35, isTrending: r() < 0.3, companyId, isActive: true,
          bookingMode: "external_primary", bookingUrl: c.website,
          latitude: c.lat + (r() - 0.5) * 0.01, longitude: c.lng + (r() - 0.5) * 0.01,
          operatingDays: [0, 1, 2, 3, 4, 5, 6],
          defaultTimeSlots: ["17:00", "18:30", "20:00", "21:30"].map((time) => ({ time, price: room.price })),
        });
        rooms.push({ id, companyId, title: room.title, image });
      }
    }

    // ── Players ──
    const userIds: Id<"users">[] = [];
    for (let i = 0; i < PLAYERS.length; i++) {
      const p = PLAYERS[i];
      const login = i < PLAYER_LOGINS.length;
      const email = login ? PLAYER_LOGINS[i] : `player${i + 1}${DOMAIN}`;
      const since = new Date(now - (40 + i * 23) * DAY);
      userIds.push(await ctx.db.insert("users", {
        name: p.name, email, password: login ? loginHash : lockedHash, avatar: "", title: "Escape Rookie",
        memberSince: since.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        played: 0, escaped: 0, awards: 0, wishlist: [pick(rooms).id], city: p.city, emailVerified: true,
        language: "el", ...(p.bio ? { bio: p.bio } : {}),
      }));
    }

    // ── Follows: the two log-in players follow each other; a lively network around them ──
    const follow = async (a: number, b: number) => {
      if (a === b) return;
      const has = await ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", userIds[a]).eq("followingId", userIds[b])).first();
      if (!has) await ctx.db.insert("follows", { followerId: userIds[a], followingId: userIds[b], createdAt: now - Math.floor(r() * 60) * DAY });
    };
    await follow(0, 1); await follow(1, 0);
    for (let i = 0; i < userIds.length; i++) {
      for (let k = 0; k < 4; k++) {
        const j = Math.floor(r() * userIds.length);
        await follow(i, j);
        if (r() < 0.6) await follow(j, i);
      }
    }
    // Players 2 and 3 follow Maria but she doesn't follow them back (follow-back buttons)
    await follow(2, 0); await follow(3, 0);
    for (let i = 0; i < userIds.length; i++) {
      for (const cid of companyIds) if (r() < 0.25) await ctx.db.insert("companyFollows", { userId: userIds[i], companyId: cid, createdAt: now - 10 * DAY });
    }

    // ── Games played: a QR stamp per game (counts on the leaderboard and the passport) ──
    const played = new Map<string, Set<string>>();
    const stats = userIds.map(() => ({ played: 0, escaped: 0 }));
    for (let i = 0; i < userIds.length; i++) {
      const count = i === 0 ? 9 : i === 1 ? 6 : 1 + Math.floor(r() * 11);
      const set = new Set<string>();
      for (let k = 0; k < count * 3 && set.size < Math.min(count, rooms.length); k++) {
        const room = pick(rooms);
        if (set.has(room.id)) continue;
        set.add(room.id);
        const escaped = r() < 0.72;
        const at = now - Math.floor(2 + r() * 150) * DAY;
        const sessionId = await ctx.db.insert("stampSessions", {
          companyId: room.companyId, roomId: room.id, players: 4, claimed: 1, escaped,
          escapeSeconds: escaped ? Math.floor(2400 + r() * 1200) : undefined, playedAt: at,
          token: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16),
          expiresAt: at + DAY, createdAt: at,
        });
        await ctx.db.insert("stamps", {
          userId: userIds[i], roomId: room.id, companyId: room.companyId, sessionId, escaped,
          escapeSeconds: escaped ? Math.floor(2400 + r() * 1200) : undefined, playedAt: at, createdAt: at,
        });
        stats[i].played++;
        if (escaped) stats[i].escaped++;
      }
      played.set(userIds[i], set);
    }
    for (let i = 0; i < userIds.length; i++) {
      await ctx.db.patch(userIds[i], { played: stats[i].played, escaped: stats[i].escaped, title: RANK(stats[i].played), awards: Math.floor(stats[i].played / 3) });
    }

    // ── Reviews from players who played the room; the room's rating follows ──
    const ratingSum = new Map<string, { sum: number; n: number }>();
    for (let i = 0; i < userIds.length; i++) {
      for (const roomId of played.get(userIds[i]) ?? []) {
        if (r() < 0.35) continue;
        const rating = r() < 0.6 ? 5 : r() < 0.8 ? 4 : 3;
        await ctx.db.insert("reviews", {
          userId: userIds[i], roomId: roomId as Id<"rooms">, rating, text: pick(REVIEW_TEXTS),
          createdAt: now - Math.floor(r() * 120) * DAY, status: "published",
        });
        const s = ratingSum.get(roomId) ?? { sum: 0, n: 0 };
        ratingSum.set(roomId, { sum: s.sum + rating, n: s.n + 1 });
      }
    }
    for (const room of rooms) {
      const s = ratingSum.get(room.id);
      // A few extra outside reviews so every room looks lived-in
      const extra = 8 + Math.floor(r() * 40);
      const avg = s ? (s.sum + extra * 4.6) / (s.n + extra) : 4.4 + r() * 0.5;
      await ctx.db.patch(room.id, { rating: Math.round(avg * 10) / 10, reviews: (s?.n ?? 0) + extra });
    }

    // ── Community posts, likes and comments ──
    const postIds: Id<"posts">[] = [];
    for (let k = 0; k < 18; k++) {
      const i = k < 4 ? k % 2 : Math.floor(r() * userIds.length);
      const mine = [...(played.get(userIds[i]) ?? [])];
      const room = mine.length && r() < 0.75 ? rooms.find((x) => x.id === mine[Math.floor(r() * mine.length)]) : undefined;
      const withRating = room && r() < 0.6;
      postIds.push(await ctx.db.insert("posts", {
        authorType: "user", authorUserId: userIds[i],
        text: room ? `${pick(POST_TEXTS)}\n📍 ${room.title}` : pick(POST_TEXTS),
        media: room && r() < 0.8 ? [{ type: "image" as const, url: room.image }] : [],
        ...(room ? { roomId: room.id } : {}), ...(withRating ? { rating: r() < 0.7 ? 5 : 4 } : {}),
        likes: 0, createdAt: now - Math.floor(k * 0.8 * DAY + r() * DAY),
      }));
    }
    // Companies announce rooms too
    for (const room of rooms.filter((_, idx) => idx % 4 === 0)) {
      postIds.push(await ctx.db.insert("posts", {
        authorType: "company", authorCompanyId: room.companyId,
        text: `Νέες ώρες αυτή την εβδομάδα για το «${room.title}»! Κλείστε νωρίς, τα Σαββατοκύριακα γεμίζουν γρήγορα 🔐`,
        media: [{ type: "image", url: room.image }], roomId: room.id, likes: 0,
        createdAt: now - Math.floor(r() * 20) * DAY,
      }));
    }
    const COMMENTS = ["Τέλειο!! 🔥", "Πάμε κι εμείς το Σάββατο!", "Πόσα λεπτά κάνατε;", "Το έχουμε στη λίστα!", "Συγχαρητήρια ομάδα 👏", "Ήταν και για μας από τα καλύτερα"];
    for (const postId of postIds) {
      const likers = new Set<number>();
      const n = Math.floor(r() * 9);
      for (let k = 0; k < n; k++) likers.add(Math.floor(r() * userIds.length));
      for (const li of likers) await ctx.db.insert("postLikes", { postId, userId: userIds[li], createdAt: now - Math.floor(r() * 10) * DAY });
      await ctx.db.patch(postId, { likes: likers.size });
      const c = Math.floor(r() * 3);
      for (let k = 0; k < c; k++) {
        await ctx.db.insert("postComments", { postId, userId: userIds[Math.floor(r() * userIds.length)], text: pick(COMMENTS), createdAt: now - Math.floor(r() * 5) * DAY });
      }
    }

    // ── Job ads ──
    const JOBS: { company: number; title: string; roles: string[]; city: string; description: string }[] = [
      { company: 0, title: "Game Master (part-time)", roles: ["gm"], city: "Athens",
        description: "Ψάχνουμε game master για απογεύματα και Σαββατοκύριακα. Θα σε εκπαιδεύσουμε σε όλα τα δωμάτια. Χαμόγελο, υπευθυνότητα και αγάπη για τα παιχνίδια." },
      { company: 0, title: "Ηθοποιός για horror δωμάτιο", roles: ["actor"], city: "Athens",
        description: "Για το «Δωμάτιο 13» ζητάμε ηθοποιό με εμπειρία στον αυτοσχεδιασμό. Βράδια Πέμπτης έως Σαββάτου." },
      { company: 2, title: "Υποδοχή και κρατήσεις", roles: ["host"], city: "Thessaloniki",
        description: "Υποδοχή ομάδων, τηλέφωνα και κρατήσεις. Ιδανικό για φοιτητές, ευέλικτο ωράριο." },
      { company: 3, title: "Ηθοποιοί (2 θέσεις)", roles: ["actor"], city: "Thessaloniki",
        description: "Νέο δωμάτιο τρόμου ανοίγει τον επόμενο μήνα. Ψάχνουμε δύο ηθοποιούς για πρόβες και παραστάσεις." },
      { company: 5, title: "Game Master", roles: ["gm", "host"], city: "Heraklion",
        description: "Πλήρης ή μερική απασχόληση. Αγγλικά απαραίτητα, το καλοκαίρι έχουμε πολλούς τουρίστες." },
    ];
    for (const j of JOBS) {
      await ctx.db.insert("jobPosts", {
        companyId: companyIds[j.company], title: j.title, description: j.description, roles: j.roles, genders: [],
        country: "GR", city: j.city, contactEmail: COMPANIES[j.company].email, status: "open",
        createdAt: now - Math.floor(r() * 14) * DAY, updatedAt: now,
      });
    }

    // ── 60 days of room page views and "Book now" clicks, for the portal's stats
    //    (two full 30-day periods, so "vs the month before" is a believable +20–30%) ──
    for (const room of rooms) {
      const popular = 0.6 + r() * 1.2;
      for (let d = 59; d >= 0; d--) {
        const ms = now - d * DAY;
        const weekend = [5, 6, 0].includes(new Date(ms).getDay());
        const growth = 1 + (59 - d) / 200; // a gentle climb
        const views = Math.round((6 + r() * 10) * popular * growth * (weekend ? 1.6 : 1));
        const clicks = Math.round(views * (0.12 + r() * 0.12));
        const date = athensDate(ms);
        await ctx.db.insert("roomViews", { roomId: room.id, companyId: room.companyId, date, count: views });
        if (clicks) await ctx.db.insert("bookClicks", { roomId: room.id, companyId: room.companyId, date, count: clicks });
      }
    }

    return {
      companies: companyIds.length, rooms: rooms.length, players: userIds.length, posts: postIds.length, jobs: JOBS.length,
      logins: { company: COMPANY_LOGIN, players: PLAYER_LOGINS, password: "the one you typed" },
    };
  },
});

/** The exact emails seed makes, so clear never touches anyone else's account. */
const SEEDED_COMPANY_EMAILS = new Set(COMPANIES.map((c) => c.email));
const SEEDED_USER_EMAILS = new Set(PLAYERS.map((_, i) => (i < PLAYER_LOGINS.length ? PLAYER_LOGINS[i] : `player${i + 1}${DOMAIN}`)));

/** Removes everything demoSeed:seed made (only its own accounts and what hangs off them). */
export const clear = internalMutation({
  args: {},
  handler: async (ctx) => {
    guard();
    const companies = (await ctx.db.query("companies").collect()).filter((c) => SEEDED_COMPANY_EMAILS.has(c.email));
    const users = (await ctx.db.query("users").collect()).filter((u) => SEEDED_USER_EMAILS.has(u.email));
    const companySet = new Set<string>(companies.map((c) => c._id));
    const userSet = new Set<string>(users.map((u) => u._id));
    let removed = 0;
    const del = async (id: any) => { await ctx.db.delete(id); removed++; };

    const rooms = (await ctx.db.query("rooms").collect()).filter((x) => x.companyId && companySet.has(x.companyId));
    const roomSet = new Set<string>(rooms.map((x) => x._id));
    const posts = (await ctx.db.query("posts").collect()).filter(
      (p) => (p.authorUserId && userSet.has(p.authorUserId)) || (p.authorCompanyId && companySet.has(p.authorCompanyId))
    );
    const postSet = new Set<string>(posts.map((p) => p._id));

    for (const x of await ctx.db.query("postLikes").collect()) if (postSet.has(x.postId) || userSet.has(x.userId)) await del(x._id);
    for (const x of await ctx.db.query("postComments").collect()) if (postSet.has(x.postId) || userSet.has(x.userId)) await del(x._id);
    for (const p of posts) await del(p._id);
    for (const x of await ctx.db.query("reviews").collect()) if (roomSet.has(x.roomId) || userSet.has(x.userId)) await del(x._id);
    for (const x of await ctx.db.query("stamps").collect()) if (roomSet.has(x.roomId) || userSet.has(x.userId)) await del(x._id);
    for (const x of await ctx.db.query("stampSessions").collect()) if (companySet.has(x.companyId)) await del(x._id);
    for (const x of await ctx.db.query("follows").collect()) if (userSet.has(x.followerId) || userSet.has(x.followingId)) await del(x._id);
    for (const x of await ctx.db.query("companyFollows").collect()) if (userSet.has(x.userId) || companySet.has(x.companyId)) await del(x._id);
    for (const x of await ctx.db.query("jobPosts").collect()) if (companySet.has(x.companyId)) await del(x._id);
    for (const x of await ctx.db.query("roomViews").collect()) if (roomSet.has(x.roomId)) await del(x._id);
    for (const x of await ctx.db.query("bookClicks").collect()) if (roomSet.has(x.roomId)) await del(x._id);
    for (const x of await ctx.db.query("userSessions").collect()) if (userSet.has((x as any).userId)) await del(x._id);
    for (const x of await ctx.db.query("companySessions").collect()) if (companySet.has((x as any).companyId)) await del(x._id);
    for (const x of rooms) await del(x._id);
    for (const x of users) await del(x._id);
    for (const x of companies) await del(x._id);
    return { removed };
  },
});

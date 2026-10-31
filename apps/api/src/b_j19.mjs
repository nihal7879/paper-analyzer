import { Paper } from "./lib.mjs";
const r = String.raw;
const B = "D:/bo-extract/inventory-20261023-124941/Oxford AQA/Oxford AQA/Unit 3/";
const P = new Paper("9630_j19_3", {
  board: "OxfordAQA", curriculum: "OxfordAQA International A Level", subjectCode: "9630", subjectName: "Physics", paperCode: "3",
  componentName: "Unit 3: Fields and their consequences (PH03)", year: 2019, seasonCode: "j", totalMarks: 80,
}, B + "2019-unit3-2019-01-PH03-qp.pdf", B + "2019-unit3-2019-01-PH03-ms.pdf");
const S = (n, marks, text, topic, sub, diff, kw, page, dia, ans, qr, ms, extra = {}) =>
  P.add({ n, type: extra.type || "STRUCTURED", marks, text, topic, sub, diff, kw, page, pages: extra.pages, dia, ans, qr, ms, conf: extra.conf });
const T = (...a) => { const e = a[12] || {}; e.type = "THEORY"; a[12] = e; return S(...a); };
const mL = (p, a, b) => [[p, a, b, 0.02, 0.935]];
const mR = (p, a, b) => [[p, a, b, 0.02, 0.935]];
const M = (n, text, opts, correct, topic, sub, kw, page, dia, qr, diff = "MEDIUM", conf) => {
  const k = Number(n);
  const ms = k <= 21 ? [[11, 0.19 + (k - 6) * 0.0423, 0.19 + (k - 5) * 0.0423, 0.05, 0.245]] : [[11, 0.19 + (k - 22) * 0.0423, 0.19 + (k - 21) * 0.0423, 0.245, 0.445]];
  P.add({ n, type: "MCQ", marks: 1, text, opts, correct, topic, sub, diff, kw, page, dia, qr, ms, conf });
};

// Q1
S("1(a)", 1, r`**Figure 1** shows a fairground ride on which riders perform horizontal circles about the centre of the ride. Each seat is attached to the top of the ride with a chain of negligible mass. Two seats, **A** and **B**, are connected to the ride at different distances from the vertical axis.

The chain of seat **A** makes an angle $\theta$ to the vertical. When the ride is rotating at its maximum angular velocity $\omega_{\text{max}}$, $\theta$ is $35^\circ$.

The centripetal force acting on a rider in seat **A** at $\omega_{\text{max}}$ is $F_{\text{max}}$.

State an expression for $F_{\text{max}}$ in terms of $T$ and $\theta$.`, 6, "Circular motion", "EASY", ["centripetal force", "tension", "conical pendulum", "resolving forces", "circular motion"], 2,
  [[2, 0.19, 0.265, 0.78, 0.545]],
  r`$T\sin\theta$ (1)

Accept $T\sin35$ or $T\cos55$.`,
  [[2, 0.145, 0.765]], mL(4, 0.18, 0.23));
S("1(b)", 2, r`The tension $T$ in the chain of **A** is $950\,\text{N}$ when the ride is rotating at $\omega_{\text{max}}$.

Calculate the total mass of the rider and seat **A**.`, 6, "Circular motion", "EASY", ["tension", "vertical equilibrium", "weight", "resolving forces", "mass"], 3, [],
  r`- $T\cos\theta = mg$ seen (1)
- $79(.3)\,(\text{kg})$ (1)`,
  [[3, 0.08, 0.305]], mL(4, 0.245, 0.32));
S("1(c)", 3, r`$r$ is the radius of the circular path of seat **A**.

Show that $\omega_{\text{max}} = 0.84\sqrt{\dfrac{g}{r}}$`, 6, "Circular motion", "MEDIUM", ["angular velocity", "centripetal force", "tan theta", "conical pendulum", "show that"], 3, [],
  r`- Evidence of $T\sin\theta = mr\omega^2$ being used or $F_{\text{max}} = mr\omega^2$ (1)
- Divides $\dfrac{T\sin\theta}{T\cos\theta}$ or equivalent (1)
- Evidence of correct rearrangement (1) (changes subject to $\omega^2$ and then takes square root)`,
  [[3, 0.325, 0.65]], mL(4, 0.335, 0.46));
S("1(d)", 2, r`The centre of mass of the rider and seat **A** is $7.2\,\text{m}$ from the vertical axis of the ride.

Calculate the time for one revolution of the ride when $\theta$ is $35^\circ$.`, 6, "Circular motion", "MEDIUM", ["period", "angular velocity", "time for one revolution", "radius", "circular motion"], 3, [],
  r`- $\omega = 0.98(0)$ **OR** $T = \dfrac{2\pi}{\omega}$ seen (1)
- $6.4\,(\text{s})$ (1)`,
  [[3, 0.655, 0.89]], mL(4, 0.475, 0.56));
T("1(e)", 2, r`**Figure 2** shows the angle $\theta_{\text{B}}$ that the chain of seat **B** makes to the vertical when the ride is rotating at $\omega_{\text{max}}$.

Explain why $\theta_{\text{B}}$ will be less than $\theta$ when the ride is rotating at $\omega_{\text{max}}$.`, 6, "Circular motion", "HARD", ["angular velocity", "radius", "tan theta", "centripetal force", "conical pendulum"], 4,
  [[4, 0.19, 0.125, 0.78, 0.385]],
  r`- Recognises that $\omega_{\text{A}} = \omega_{\text{B}}$ and that $r_{\text{A}} > r_{\text{B}}$ **OR** quotes a suitable expression for $\theta$ such as $\tan\theta = \dfrac{mr\omega^2}{mg}$ or $\omega^2 r = g\tan\theta$ (1)
- Uses both parts of MP1 to demonstrate that $\tan\theta \propto r$ (1)`,
  [[4, 0.08, 0.655]], mL(4, 0.575, 0.705));

// Q2
T("2(a)", 3, r`**Figure 3** shows a circuit used to provide an output voltage $V_{\text{out}}$.

The capacitor **C** has a capacitance of $2200\,\mu\text{F}$ and is initially uncharged. The battery has an emf $E$ of $6.0\,\text{V}$ and a negligible internal resistance.

Switch **S** is closed. The current in resistor $\text{R}_1$ is $I$.

**Figure 4** shows the variation of $I$ with time $t$ after switch **S** is closed.

$I_1$ is the current in **C** and $I_2$ is the current in resistors $\text{R}_2$ and $\text{R}_\text{v}$.

Explain why $I$ varies as shown in **Figure 4**.`, 9, "Capacitor charge and discharge", "MEDIUM", ["capacitor charging", "current", "exponential decay", "parallel circuit", "potential difference"], 6,
  [[6, 0.18, 0.18, 0.80, 0.365], [6, 0.31, 0.415, 0.66, 0.61]],
  r`Any 3 (1)(1)(1):

- $I_1$ (starts high) and falls (exponentially) as the capacitor charges...
- ...because the pd across C grows (and opposes $E$)
- As the pd across C increases, the pd across $\text{R}_1$ decreases
- $I_2$ has a constant value
- $I = I_1 + I_2$`,
  [[6, 0.08, 0.915]], mR(5, 0.18, 0.395), { conf: 0.85 });
S("2(b)", 2, r`The variable resistor $\text{R}_\text{v}$ is set to a resistance of $4.0\,\text{k}\Omega$. $\text{R}_2$ has a resistance of $2.0\,\text{k}\Omega$.

The capacitor is fully charged and then switch **S** is opened, causing $V_{\text{out}}$ to decrease.

Show that the potential difference across **C** is approximately $1\,\text{V}$ when $V_{\text{out}}$ is $0.70\,\text{V}$.`, 9, "Capacitor charge and discharge", "MEDIUM", ["potential divider", "capacitor discharge", "potential difference", "resistors in series", "show that"], 7, [],
  r`- $I_2 = \dfrac{0.7}{4000}$ **OR** $V_C = \dfrac{6000}{4000}\times0.7$ **OR** $= \dfrac{3}{2}\times0.7$ (1)
- $1.05\,(\text{V})$ cao to 3 sf (1)`,
  [[7, 0.08, 0.31]], mR(5, 0.415, 0.53));
S("2(c)", 4, r`Calculate the time $T$ after switch **S** is opened for $V_{\text{out}}$ to decrease to $0.70\,\text{V}$.`, 9, "Capacitor charge and discharge", "HARD", ["capacitor discharge", "time constant", "exponential decay", "natural logarithm", "rc circuit"], 7, [],
  r`- Uses $V = V_0 e^{-\frac{t}{RC}}$ (1) (accept substitution or rearrangement as evidence of use of formula)
- Takes logs correctly; look for $t = RC\ln\dfrac{V_0}{V}$ (1)
- Correct substitution into correct log formula, e.g. $t = 13.2\ln\dfrac{6}{1.05}$, or calculates time constant (accept $13.2$ or $8.8$ as the time constant for this MP) (1)
- $23(.0)\,(\text{s})$ (1)

Condone incorrect value for resistance for 1st and 3rd mark. Use of $V = 1\,\text{V}$ instead of $1.05\,\text{V}$ gives $t = 23.7\,\text{s}$ and gets full marks. Use of $R = 4000\,\Omega$ instead of $6000\,\Omega$ gives $15.3\,\text{s}$ or $15.8\,\text{s}$ and gets 3 marks.`,
  [[7, 0.315, 0.64]], mR(5, 0.55, 0.82));
T("2(d)", 2, r`The resistance of $\text{R}_\text{v}$ can be increased or decreased.

**C** is fully charged again before switch **S** is opened.

Explain how the adjustment of $\text{R}_\text{v}$ can be used to increase $T$.`, 9, "Capacitor charge and discharge", "MEDIUM", ["time constant", "variable resistor", "capacitor discharge", "resistance", "rc"], 7, [],
  r`- Increasing (the value of) $\text{R}_\text{v}$ increases $T$ (wtte) (1)
- and explanation in terms of increasing time constant or resistance of discharge circuit or appropriate use of formula (1)`,
  [[7, 0.655, 0.905]], mL(6, 0.165, 0.265));

// Q3
S("3(a)", 2, r`A low voltage supply is needed for a battery charger.

An engineer designs a transformer to convert an alternating input voltage of $230\,\text{V}_{\text{rms}}$ to the low voltage needed for the battery charger.

The transformer has $800$ turns on the primary coil and $28$ turns on the secondary coil.

Calculate $V_\text{s}$ the rms output voltage from the secondary coil.

For this calculation, assume that the transformer is ideal.`, 10, "The operation of a transformer", "EASY", ["transformer", "turns ratio", "rms voltage", "secondary coil", "step-down"], 8, [],
  r`- Use of $\dfrac{N_\text{s}}{N_\text{p}} = \dfrac{V_\text{s}}{V_\text{p}}$ (1) (either correct substitution or rearrangement)
- $8.1$ or $8.05\,(\text{V})$ (1)`,
  [[8, 0.08, 0.40]], mR(7, 0.135, 0.235));
S("3(b)", 4, r`The frequency of the input voltage is $50\,\text{Hz}$.

Sketch on the axes below a graph of the variation of the output voltage with time $t$.

The graph should show the voltage variation over a period of $50\,\text{ms}$.

Add an appropriate scale to the voltage axis.`, 10, "Alternating currents", "MEDIUM", ["alternating current", "peak voltage", "rms", "period", "sketch graph"], 8,
  [[8, 0.13, 0.69, 0.86, 0.905]],
  r`- At least 2 cycles of ac shown with or without scales on axis (1) (must be even and with consistent peak values)
- Evidence of the use of $\sqrt{2}$ or $t = \dfrac{1}{f}$ (1) (students who get either $V_{\text{max}}$ or $T$ correct get this mark also)
- Peaks at $11.3\,(\text{V})$ (1)
- Time period $20\,\text{ms}$ shown on graph or calculated (1) (accept even if value of $T$ on graph contradicts the calculated value)`,
  [[8, 0.415, 0.91]], mR(7, 0.255, 0.405));
S("3(c)", 2, r`In practice, the transformer is $90\%$ efficient. The rms current in the secondary coil is $2.4\,\text{A}$.

Calculate in $\text{mA}$ the rms current in the primary coil of the transformer.`, 10, "The operation of a transformer", "MEDIUM", ["transformer efficiency", "primary current", "power", "rms current", "transformer"], 9, [],
  r`- $V_\text{s}I_\text{s} = 0.9V_\text{p}I_\text{p}$ seen in some form (1)
- $93(.3)\,(\text{mA})$ (1) (ecf from 3(a): answer should be $11.6\times$ their 3(a))`,
  [[9, 0.08, 0.315]], mR(7, 0.425, 0.50));
T("3(d)", 2, r`The engineer now connects the output of the transformer in series with a semiconductor diode and the battery charger.

**Figure 5** shows the circuit. The battery charger behaves as an ohmic conductor.

Deduce how the magnitude and waveform of the voltage $V_\text{c}$ across the battery charger are different from the magnitude and waveform of the output from the transformer.`, 10, "Alternating currents", "MEDIUM", ["diode", "half-wave rectification", "waveform", "peak voltage", "alternating current"], 9,
  [[9, 0.22, 0.42, 0.75, 0.61]],
  r`- Magnitude of (peak) pd is **less** (because of pd dropped across diode) (1)
- Only positive "humps" remain **or** negative is blocked **or** the output is (half wave) rectified (1)`,
  [[9, 0.34, 0.885]], mR(7, 0.525, 0.645));
T("3(e)", 4, r`One inefficiency of the transformer arises from eddy current losses.

Explain how eddy current losses occur in a transformer and go on to suggest how good transformer design minimises eddy current losses.`, 10, "The operation of a transformer", "MEDIUM", ["eddy currents", "laminated core", "transformer efficiency", "induced emf", "energy loss"], 10, [],
  r`Any 4 (1)(1)(1)(1):

- Eddy currents or emf induced in the core...
- ...because of varying magnetic field or flux
- Eddy currents dissipate energy (wtte)
- Core is laminated...
- ...to reduce (magnitude of) eddy currents`,
  [[10, 0.08, 0.63]], mR(7, 0.665, 0.815));

// Q4
S("4(a)", 1, r`**Figure 6** shows an isolated spherical oil drop carrying a charge of $+6.4\times10^{-19}\,\text{C}$.

Assume that the oil drop behaves as a charged, conducting sphere.

Draw electric field lines onto **Figure 6** to show the electric field around the oil drop.`, 8, "Electric field strength", "EASY", ["electric field lines", "radial field", "point charge", "charged sphere", "field pattern"], 11,
  [[11, 0.38, 0.13, 0.60, 0.29]],
  r`At least 6 radial lines, straight and evenly spaced by eye with arrows away from the centre (1)

Accept lines not drawn with a ruler if they are straight and symmetrical. Condone field shown within the drop.`,
  [[11, 0.08, 0.39]], mL(8, 0.16, 0.255));
T("4(b)", 1, r`Define the absolute electrical potential at a point in an electric field.`, 8, "Electric potential", "EASY", ["electric potential", "work done", "unit charge", "infinity", "definition"], 11, [],
  r`Work done moving **unit** charge from infinity (to the point in the field) (1)

Accept equation with terms defined.`,
  [[11, 0.405, 0.55]], mL(8, 0.275, 0.32));
S("4(c)", 2, r`The oil drop has a radius of $1.4\times10^{-6}\,\text{m}$.

Calculate the absolute electric potential at the surface of the oil drop.`, 8, "Electric potential", "MEDIUM", ["electric potential", "charged sphere", "coulomb's law", "radius", "permittivity"], 11, [],
  r`- Substitution into $V = \dfrac{1}{4\pi\varepsilon_0}\dfrac{Q}{r}$ (1) (condone use of $1.6\times10^{-19}$ for the 1st MP only)
- $4.11\times10^{-3}\,(\text{V})$ (1)`,
  [[11, 0.565, 0.88]], mL(8, 0.34, 0.43), { conf: 0.85 });
S("4(d)", 1, r`**Figure 7** shows the charged oil drop stationary in air in an electric field between two parallel plates. The potential difference between the plates is $V$.

Draw and label arrows on **Figure 7** to represent the forces acting on the oil drop.`, 8, "Electric field strength", "EASY", ["free-body diagram", "electric force", "weight", "parallel plates", "millikan"], 12,
  [[12, 0.22, 0.165, 0.75, 0.475]],
  r`Up arrow labelled $F_\text{E}$ or $\dfrac{Vq}{d}$ or similar **and** down arrow labelled weight, $W$, or $mg$ or similar (1)

Condone difference in length of arrows. Accept if the upward pointing arrow is labelled $F$.`,
  [[12, 0.08, 0.52]], mL(8, 0.45, 0.53));
T("4(e)", 2, r`The potential difference between the plates is now reversed so that the oil drop is attracted towards the lower plate.

Explain why the initial acceleration of the oil drop is approximately $20\,\text{m s}^{-2}$.`, 8, "Electric field strength", "MEDIUM", ["electric force", "resultant force", "acceleration", "weight", "parallel plates"], 12, [],
  r`- Recognition that $F_\text{E}$ is equal (and opposite) to weight (1)
- New resultant force is $2mg$ (owtte) (1)

$2\times9.81$ or $19.62$ seen gets only 1 mark if it is without acceptable explanation.`,
  [[12, 0.545, 0.79]], mL(8, 0.555, 0.65));
T("4(f)", 2, r`Describe and explain the motion of the oil drop after the potential difference between the plates is reversed.`, 8, "Electric field strength", "MEDIUM", ["terminal speed", "air resistance", "electric force", "acceleration", "motion"], 13, [],
  r`(Drop moves downwards.) Any 2 (1)(1):

- (Weight and) electrostatic force remain constant
- Air resistance increases (with speed)
- Terminal speed reached **or** acceleration gets smaller`,
  [[13, 0.08, 0.32]], mL(8, 0.67, 0.81));

// Q5
S("5(a)", 3, r`A charged particle enters a region of uniform magnetic flux density $B$. The particle enters at right angles to the magnetic field.

Show that the radius of curvature $r$ of the particle in the magnetic field is:

$$r = \frac{1}{Bq}\sqrt{2E_\text{k}m}$$

where $q$ = the charge on the particle, $E_\text{k}$ = the kinetic energy of the particle, $m$ = the mass of the particle.`, 10, "Moving charges in a magnetic field", "MEDIUM", ["radius of curvature", "magnetic force", "kinetic energy", "bqv", "centripetal force"], 14, [],
  r`- Uses $E_\text{k} = \frac{1}{2}mv^2$ (1)
- Uses $Bqv = \dfrac{mv^2}{r}$ (1)
- Convincing manipulation (1), e.g. shows that $mv = \sqrt{2E_\text{k}m}$ or $v = \sqrt{\dfrac{2E_\text{k}}{m}}$`,
  [[14, 0.08, 0.90]], mR(9, 0.18, 0.31));
S("5(b)", 3, r`A stream of alpha particles and a stream of beta particles both enter a uniform magnetic field at right angles to the field direction.

The alpha particles each have a kinetic energy of $7.4\,\text{MeV}$.

The beta particles each have a kinetic energy of $1.1\,\text{MeV}$.

The radius of the track of the alpha particles is $r_\alpha$ and the radius of the track of the beta particles is $r_\beta$.

The two streams of particles do not interact and relativistic effects may be ignored.

Calculate $\dfrac{r_\alpha}{r_\beta}$.

mass of an alpha particle $= 6.64\times10^{-27}\,\text{kg}$`, 10, "Moving charges in a magnetic field", "HARD", ["alpha particles", "beta particles", "radius ratio", "magnetic field", "kinetic energy"], 15, [],
  r`Max 2 from (1)(1):

- $\dfrac{q_\alpha}{q_\beta} = (-)2$ used or seen in calculation
- $\dfrac{E_\alpha}{E_\beta} = 6.7$ **OR** $\dfrac{7.4}{1.1}$ used or seen in calculation
- $\dfrac{m_\alpha}{m_\beta} = 7360$ **OR** $\dfrac{6.64\times10^{-27}}{9.11\times10^{-31}}$ used or seen in calculation

$110$ or $111$ (1) (all 3 marks for correct answer)

**OR**

- Correctly converts 1 energy to joule ($1.18\times10^{-12}$ or $1.76\times10^{-13}$) (1)
- Correctly substituting into $r = \dfrac{1}{Bq}\sqrt{2E_\text{k}m}$ for one particle, or a correct value of $r$ ($\dfrac{0.392}{B}$ or $\dfrac{3.54\times10^{-3}}{B}$) (1)
- $110$ or $111$ (1)`,
  [[15, 0.08, 0.60]], mL(10, 0.08, 0.705));

// Section B MCQ
M("6", r`The mean radius of the Earth's orbit around the Sun is $1.5\times10^{8}\,\text{km}$.

What is the mean centripetal acceleration of the Earth about the Sun?

$1\text{ year} = 3.15\times10^{7}\,\text{s}$`,
  [r`$6.0\times10^{-6}\,\text{rad s}^{-2}$`, r`$6.0\times10^{-3}\,\text{rad s}^{-2}$`, r`$3.0\times10^{1}\,\text{rad s}^{-2}$`, r`$6.0\times10^{4}\,\text{rad s}^{-2}$`], "B", 6, "Circular motion", ["centripetal acceleration", "orbit", "angular velocity", "period", "earth"], 16,
  [], [[16, 0.455, 0.71]], "MEDIUM", 0.85);
M("7", r`The graph shows the variation of displacement $x$ with time $t$ for an object performing simple harmonic motion. $T$ is the period of the oscillation.

Which graph shows the variation of acceleration $a$ with time $t$ for the same object?`,
  ["Graph A", "Graph B", "Graph C", "Graph D"], "C", 6, "Simple harmonic motion", ["simple harmonic motion", "acceleration", "displacement", "phase", "graph"], 17,
  [[17, 0.36, 0.125, 0.61, 0.22], [17, 0.17, 0.29, 0.80, 0.535]], [[17, 0.08, 0.69]]);
M("8", r`The graph shows the variation of the velocity $v$ with time $t$ for an object performing simple harmonic motion. The period of the oscillation is $T$.

The maximum acceleration of the object is equivalent to the:`,
  [r`gradient of the graph when $t = 0$`, r`gradient of the graph when $t = \dfrac{T}{4}$`, r`area between the graph and the $t$ axis between $t = 0$ and $t = \dfrac{T}{4}$`, r`area between the graph and the $t$ axis between $t = 0$ and $t = \dfrac{T}{2}$`], "A", 6, "Simple harmonic motion", ["simple harmonic motion", "velocity-time graph", "gradient", "maximum acceleration", "area under graph"], 18,
  [[18, 0.36, 0.125, 0.62, 0.215]], [[18, 0.08, 0.48]]);
M("9", r`The total energy of an object that is performing simple harmonic motion is:`,
  ["always zero.", "a maximum when the object is at maximum speed.", "a maximum when the object is at maximum displacement from the equilibrium position.", "constant throughout a complete cycle."], "D", 6, "Simple harmonic motion", ["total energy", "simple harmonic motion", "kinetic energy", "potential energy", "energy conservation"], 18,
  [], [[18, 0.505, 0.74]], "EASY");
M("10", r`In the diagram, each mass $m$ is identical and each spring is identical.

The masses are displaced vertically from their rest position and released.

What is the ratio $\dfrac{\text{period of oscillation of P}}{\text{period of oscillation of Q}}$?`,
  [r`$\dfrac{1}{4}$`, r`$\dfrac{1}{2}$`, r`$1$`, r`$2$`], "B", 6, "Simple harmonic motion", ["mass-spring system", "springs in series", "period", "spring constant", "ratio"], 19,
  [[19, 0.33, 0.125, 0.65, 0.325]], [[19, 0.08, 0.60]], "HARD");
M("11", r`The graph shows the variation of displacement $x$ with time $t$ for an object performing simple harmonic motion. Point **P** has a displacement of $2\,\text{cm}$ from the equilibrium position.

What is the velocity of the object at point **P**?`,
  [r`$11\,\text{cm s}^{-1}$`, r`$18\,\text{cm s}^{-1}$`, r`$27\,\text{cm s}^{-1}$`, r`$94\,\text{cm s}^{-1}$`], "C", 6, "Simple harmonic motion", ["simple harmonic motion", "velocity", "displacement", "amplitude", "angular frequency"], 20,
  [[20, 0.22, 0.135, 0.75, 0.295]], [[20, 0.08, 0.49]], "HARD");
M("12", r`What is a unit for $G$, the gravitational constant?`,
  [r`$\text{kg m}^{3}\,\text{s}^{-2}$`, r`$\text{kg}^{-1}\,\text{m}^{3}\,\text{s}^{2}$`, r`$\text{J m}^{-1}\,\text{kg}^{2}$`, r`$\text{J m kg}^{-2}$`], "D", 7, "Newton's gravitational law", ["gravitational constant", "units", "newton's law of gravitation", "si units", "dimensional analysis"], 20,
  [], [[20, 0.515, 0.705]]);
M("13", r`The diameter of the Earth is $3$ times the diameter of planet **P**.

The mass of the Earth is $18$ times the mass of **P**.

The acceleration due to gravity at the surface of the Earth is $g$.

What is the acceleration due to gravity at the surface of **P**?`,
  [r`$\dfrac{g}{6}$`, r`$\dfrac{g}{2}$`, r`$2g$`, r`$6g$`], "B", 7, "Gravitational field strength", ["gravitational field strength", "planet", "mass", "radius", "surface gravity"], 21,
  [], [[21, 0.08, 0.38]]);
M("14", r`The diagram shows the distance $D$ between the surface of the Earth and the surface of the Moon.

Which graph shows the variation with distance from the Earth's surface of the gravitational potential $V$ in the Earthâ€“Moon gravity field?`,
  ["Graph A", "Graph B", "Graph C", "Graph D"], "A", 7, "Gravitational potential", ["gravitational potential", "earth-moon system", "graph", "potential well", "distance"], 22,
  [[22, 0.24, 0.13, 0.75, 0.21], [22, 0.12, 0.285, 0.86, 0.735]], [[22, 0.08, 0.89]], "HARD");
M("15", r`Which statement about gravitational field lines is **not** correct?`,
  ["The arrows on them indicate the direction of the force that would act on a point mass at that position.", "The gravitational field lines around the Earth are directed radially away from the Earth.", "The separation of gravitational field lines is an indication of the gravitational field strength at that position.", r`They always intersect with the lines of equipotential at an angle of $90^\circ$.`], "B", 7, "Gravitational field strength", ["gravitational field lines", "radial field", "equipotentials", "field strength", "direction"], 23,
  [], [[23, 0.08, 0.305]], "EASY");
M("16", r`Satellites **P** and **Q** orbit the Earth.

For **P**, the height of the orbit above the surface of the Earth is equal to the radius of the Earth.

For **Q**, the height of the orbit above the surface of the Earth is equal to $3\times$ the radius of the Earth.

The mass of **Q** is $3\times$ the mass of **P**.

**P** experiences a gravitational attraction of $600\,\text{N}$ towards the Earth.

What is the gravitational attraction experienced by **Q**?`,
  [r`$150\,\text{N}$`, r`$200\,\text{N}$`, r`$450\,\text{N}$`, r`$900\,\text{N}$`], "C", 7, "Newton's gravitational law", ["inverse square law", "gravitational force", "satellite", "orbit radius", "mass"], 23,
  [], [[23, 0.345, 0.675]], "HARD");
M("17", r`An orbiting satellite is moved to an orbit of smaller radius, causing its gravitational potential energy to decrease.

Which row shows the changes in the magnitudes of the kinetic energy and the total energy of the satellite?`,
  ["Change in kinetic energy: Decrease; change in total energy: Decrease", "Change in kinetic energy: Increase; change in total energy: Decrease", "Change in kinetic energy: Increase; change in total energy: No change", "Change in kinetic energy: Increase; change in total energy: Increase"], "B", 7, "Orbits of planets and satellites", ["orbital energy", "kinetic energy", "total energy", "satellite", "orbit radius"], 24,
  [], [[24, 0.08, 0.41]], "HARD", 0.85);
M("18", r`Many satellites in geosynchronous orbits are also geostationary.

Which is a correct statement about geostationary orbits?`,
  ["They are polar orbits.", "Their periodic time is less than one day.", "They orbit in the plane of the Equator and in the opposite direction as the Earth's rotation.", "They orbit in the plane of the Equator and in the same direction as the Earth's rotation."], "D", 7, "Orbits of planets and satellites", ["geostationary orbit", "satellite", "equator", "period", "earth's rotation"], 24,
  [], [[24, 0.435, 0.70]], "EASY");
M("19", r`What is a unit for the permittivity of free space, $\varepsilon_0$?`,
  [r`$\text{A}^{2}\,\text{kg}^{-1}\,\text{m}^{-3}\,\text{s}^{+4}$`, r`$\text{A}^{2}\,\text{kg}^{-2}\,\text{m}^{-3}\,\text{s}^{-4}$`, r`$\text{A}^{2}\,\text{kg}^{-1}\,\text{m}^{-1}\,\text{s}^{+4}$`, r`$\text{A}^{2}\,\text{kg}^{-1}\,\text{m}^{-3}\,\text{s}^{-2}$`], "A", 8, "Coulomb's law", ["permittivity of free space", "si base units", "coulomb's law", "units", "dimensional analysis"], 24,
  [], [[24, 0.72, 0.91]], "HARD");
M("20", r`Two charges $+Q$ and $-Q$ are equal in magnitude and opposite in sign.

**P** is a distance $r$ from each of the charges.

Which row shows the magnitude and direction of the electric field strength at **P** due to the two charges?`,
  [r`$\dfrac{Q}{2\sqrt{2}\pi\varepsilon_0 r^{2}}$, to right`, r`$\dfrac{Q}{2\sqrt{2}\pi\varepsilon_0 r^{2}}$, to left`, r`$\dfrac{Q^{2}}{8\pi\varepsilon_0 r^{4}}$, to right`, r`$\dfrac{Q^{2}}{8\pi\varepsilon_0 r^{4}}$, to left`], "A", 8, "Electric field strength", ["electric field strength", "vector addition", "point charges", "resultant field", "dipole"], 25,
  [[25, 0.33, 0.12, 0.64, 0.25]], [[25, 0.08, 0.605]], "HARD");
M("21", r`The diagram shows two parallel, conducting plates and a graph of the variation of potential between the plates.

What is the magnitude of the electric field strength between the plates?`,
  [r`$400\,\text{N C}^{-1}$`, r`$800\,\text{N C}^{-1}$`, r`$1600\,\text{N C}^{-1}$`, r`$40\,000\,\text{N C}^{-1}$`], "D", 8, "Electric field strength", ["uniform field", "potential gradient", "parallel plates", "electric field strength", "e = v/d"], 26,
  [[26, 0.26, 0.12, 0.72, 0.39]], [[26, 0.08, 0.585]], "EASY");
M("22", r`The diagram shows two horizontal plates with an electric field between them.

A charged particle enters at right angles to the field. The force due to the electric field is the only force acting on the particle.

Which change increases the vertical velocity of the particle as it leaves the electric field?`,
  ["Decreasing the length of the plates.", "Increasing the separation of the plates.", "Decreasing the initial velocity of the particle.", "Using a particle of greater mass but the same charge."], "C", 8, "Electric field strength", ["charged particle", "uniform field", "deflection", "projectile-like motion", "parallel plates"], 27,
  [[27, 0.32, 0.135, 0.66, 0.26]], [[27, 0.08, 0.455]]);
M("23", r`The graph shows the variation in electric field strength $E$ with distance $r$ from the centre of a charged body.

What is the potential difference between a point where $r = 20\,\text{cm}$ and a point where $r = 40\,\text{cm}$?`,
  [r`$2000\,\text{V}$`, r`$20\,000\,\text{V}$`, r`$7500\,\text{V}$`, r`$750\,000\,\text{V}$`], "B", 8, "Electric potential", ["potential difference", "area under graph", "electric field strength", "radial field", "e-r graph"], 28,
  [[28, 0.22, 0.125, 0.75, 0.33]], [[28, 0.08, 0.54]], "HARD", 0.85);
M("24", r`The table shows data for two capacitors **P** and **Q**. Each capacitor contains a dielectric material.

What is the energy stored by capacitor **Q**?`,
  [r`$160\,\text{mJ}$`, r`$320\,\text{mJ}$`, r`$640\,\text{mJ}$`, r`$1280\,\text{mJ}$`], "D", 8, "Capacitors", ["capacitance", "dielectric", "relative permittivity", "energy stored", "parallel plate capacitor"], 29,
  [[29, 0.19, 0.14, 0.79, 0.335]], [[29, 0.08, 0.54]], "HARD");
M("25", r`The graph shows the variation of the charge $Q$ on a capacitor with the potential difference $V$ across it.

Which row shows the significance of the gradient of the graph and the area between the line and the $V$ axis?`,
  ["Gradient: charging current; area: time constant", "Gradient: charging current; area: energy stored in the capacitor", "Gradient: capacitance of the capacitor; area: time constant", "Gradient: capacitance of the capacitor; area: energy stored in the capacitor"], "D", 8, "Capacitors", ["capacitance", "q-v graph", "gradient", "energy stored", "area under graph"], 30,
  [[30, 0.34, 0.125, 0.63, 0.27]], [[30, 0.08, 0.53]], "EASY");
M("26", r`Which of the following is equivalent to the time constant for a circuit used to charge or discharge a capacitor?`,
  [r`Minus the reciprocal of the gradient of a graph of ln(charge remaining) against time when the capacitor is discharging.`, r`The gradient of a graph of charge against time for the discharging capacitor at time $t = 0$`, r`The time taken for the charge to increase to $\dfrac{1}{e}$ times the maximum charge when the capacitor is charging.`, r`The time taken for the charge to fall to half of the initial charge when the capacitor is discharging.`], "A", 9, "Capacitor charge and discharge", ["time constant", "capacitor discharge", "logarithmic graph", "gradient", "rc"], 30,
  [], [[30, 0.555, 0.825]]);
M("27", r`The graph shows the variation with time of the number of nuclei of a radioactive nuclide in a sample.

What is the activity of the sample at **P**?`,
  [r`$0.9\times10^{14}\,\text{Bq}$`, r`$1.6\times10^{14}\,\text{Bq}$`, r`$4.0\times10^{14}\,\text{Bq}$`, r`$2.0\times10^{15}\,\text{Bq}$`], "B", 9, "Exponential changes in radioactivity", ["activity", "gradient", "decay curve", "number of nuclei", "tangent"], 31,
  [[31, 0.14, 0.125, 0.84, 0.495]], [[31, 0.08, 0.705]], "HARD");
M("28", r`Radioactive decay is considered to be:`,
  ["spontaneous because all nuclei of a particular nuclide have different decay constants.", "random because it is not possible to predict whether a nucleus will emit an alpha particle, a beta particle or a gamma ray.", "random because it is not possible to predict when a particular nucleus will decay.", "spontaneous because it happens suddenly when triggered by an event."], "C", 9, "Exponential changes in radioactivity", ["random decay", "spontaneous decay", "radioactivity", "probability", "nucleus"], 32,
  [], [[32, 0.08, 0.31]], "EASY");
M("29", r`A radioactive source initially contains $6.0\,\text{mg}$ of cobalt-60

The half-life of cobalt-60 is $1.66\times10^{8}\,\text{s}$.

What is the initial activity of the source?`,
  [r`$2.5\times10^{11}\,\text{Bq}$`, r`$2.5\times10^{12}\,\text{Bq}$`, r`$7.9\times10^{18}\,\text{Bq}$`, r`$1.0\times10^{27}\,\text{Bq}$`], "A", 9, "Exponential changes in radioactivity", ["activity", "half-life", "decay constant", "number of nuclei", "avogadro constant"], 32,
  [], [[32, 0.34, 0.575]], "HARD");
M("30", r`A current-carrying wire lies horizontally in a magnetic field of magnetic flux density $0.10\,\text{T}$.

The magnetic flux density $B$ is directed perpendicularly into the page.

The wire is made from a material that contains $8.5\times10^{28}$ free electrons per $\text{m}^{3}$.

The mean speed of the free electrons is $1.8\times10^{-4}\,\text{m s}^{-1}$.

The wire has a volume of $100\,\text{mm}^{3}$.

What are the magnitude and direction of the force experienced by the wire?`,
  [r`$0.024\,\text{N}$ in direction **P**`, r`$2.4\,\text{N}$ in direction **P**`, r`$0.024\,\text{N}$ in direction **Q**`, r`$2.4\,\text{N}$ in direction **Q**`], "C", 10, "Magnetic flux density", ["force on conductor", "free electrons", "drift velocity", "fleming's left hand rule", "magnetic flux density"], 33,
  [[33, 0.22, 0.175, 0.75, 0.33]], [[33, 0.08, 0.53]], "HARD");
M("31", r`A single rectangular coil has a length of $8.0\,\text{cm}$ and a width of $5.0\,\text{cm}$.

The plane of the coil is at $30^\circ$ to the horizontal in a magnetic field. The magnetic field has a magnetic flux density of $0.080\,\text{T}$ directed horizontally as shown. The current in the coil is $2.0\,\text{A}$.

What is the moment of the couple experienced by the coil?`,
  [r`$3.2\times10^{-4}\,\text{N m}$`, r`$3.7\times10^{-4}\,\text{N m}$`, r`$5.5\times10^{-4}\,\text{N m}$`, r`$6.4\times10^{-4}\,\text{N m}$`], "C", 10, "Magnetic flux density", ["couple", "torque on coil", "magnetic force", "current-carrying coil", "moment"], 34,
  [[34, 0.27, 0.155, 0.72, 0.435]], [[34, 0.08, 0.63]], "HARD");
M("32", r`Which statement is correct about the motion of charged particles in a cyclotron?`,
  ["Their speed increases in the electric field between the dees.", "Their speed increases in the magnetic field within the dees.", "Their path is parabolic inside a dee.", "Their path is a spiral inside a dee."], "A", 10, "Moving charges in a magnetic field", ["cyclotron", "dees", "electric field", "magnetic field", "charged particles"], 34,
  [], [[34, 0.66, 0.845]], "EASY");
M("33", r`A closed horizontal conducting coil falls vertically through a uniform horizontal magnetic field. The coil has a small resistance.

Due to its movement through the magnetic field, the coil will experience:`,
  ["a moment about its axis but no resultant force.", "a downward force only.", "an upward force only.", "no resultant force and no moment about its axis."], "D", 10, "Electromagnetic induction", ["electromagnetic induction", "flux linkage", "induced current", "falling coil", "lenz's law"], 35,
  [[35, 0.24, 0.125, 0.72, 0.305]], [[35, 0.08, 0.50]], "HARD");
M("34", r`The diagrams show a proton $\text{p}$ and an antiproton $\bar{\text{p}}$ entering a uniform magnetic field.

The magnetic flux density is directed out of the page.

The proton and antiproton are too far apart to experience electrostatic attraction.

Which diagram shows the motion of the proton $\text{p}$ and the antiproton $\bar{\text{p}}$?`,
  ["Diagram A", "Diagram B", "Diagram C", "Diagram D"], "D", 10, "Moving charges in a magnetic field", ["proton", "antiproton", "magnetic force", "fleming's left hand rule", "circular path"], 36,
  [[36, 0.15, 0.205, 0.82, 0.555]], [[36, 0.08, 0.715]]);
M("35", r`A transformer has a secondary rms current of $0.30\,\text{A}$, $400$ turns on the primary coil and $2000$ turns on the secondary coil.

The resistance of the primary coil is $2.0\times10^{-3}\,\Omega$.

Assume that the power loss has a negligible effect on the overall efficiency of the transformer.

What is the power loss in the primary coil?`,
  [r`$7.2\times10^{-6}\,\text{W}$`, r`$1.2\times10^{-4}\,\text{W}$`, r`$3.0\times10^{-3}\,\text{W}$`, r`$4.5\times10^{-3}\,\text{W}$`], "D", 10, "The operation of a transformer", ["transformer", "primary current", "turns ratio", "power loss", "i squared r"], 37,
  [], [[37, 0.08, 0.355]], "HARD");

P.write();

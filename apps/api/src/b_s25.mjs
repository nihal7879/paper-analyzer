import { Paper } from "./lib.mjs";
const r = String.raw;
const B = "D:/bo-extract/inventory-20261023-124941/Oxford AQA/Oxford AQA/Unit 2/";
const P = new Paper("9630_s25_2", {
  board: "OxfordAQA", curriculum: "OxfordAQA International A Level", subjectCode: "9630", subjectName: "Physics", paperCode: "2",
  componentName: "Unit 2: Electricity, waves and particles (PH02)", year: 2025, seasonCode: "s", totalMarks: 80,
}, B + "2025-unit2-2025-06-PH02-qp.pdf", B + "2025-unit2-2025-06-PH02-ms.pdf");
const S = (n, marks, text, topic, sub, diff, kw, page, dia, ans, qr, ms, extra = {}) =>
  P.add({ n, type: extra.type || "STRUCTURED", marks, text, topic, sub, diff, kw, page, pages: extra.pages, dia, ans, qr, ms, conf: extra.conf });
const T = (...a) => { const e = a[12] || {}; e.type = "THEORY"; a[12] = e; return S(...a); };
const MX = [0.045, 0.895];
const m = (p, a, b) => [[p, a, b, ...MX]];
const M = (n, text, opts, correct, topic, sub, kw, page, dia, qr, ms, diff = "MEDIUM", conf) =>
  P.add({ n, type: "MCQ", marks: 1, text, opts, correct, topic, sub, diff, kw, page, dia, qr, ms, conf });
const mq = (p, a, b) => [[p, a, b, 0.065, 0.89]];

// Q1
T("1(a)", 1, r`When light of frequency $9.1\times10^{14}\,\text{Hz}$ is incident on a metal surface, electrons are emitted. The stopping potential for these electrons is $1.65\,\text{V}$.

State what is meant by the threshold frequency for a metal.`, 5, "Photoelectric effect", "EASY", ["threshold frequency", "photoelectric effect", "electron emission", "metal surface", "definition"], 2, [],
  r`The minimum frequency of electromagnetic radiation that results in electrons being emitted (from the metal surface) (1)`,
  [[2, 0.145, 0.34]], m(4, 0.20, 0.29));
S("1(b)", 3, r`Calculate the threshold frequency for this metal.`, 5, "Photoelectric effect", "MEDIUM", ["threshold frequency", "stopping potential", "work function", "photoelectric equation", "planck constant"], 2, [],
  r`- $E_{\text{k(max)}} = eV_{\text{STOP}}$ **OR** $E = hf$ used at any point (1)
- Use of photoelectric effect equation to find $\phi$ (1)
- $5.1\times10^{14}\,(\text{Hz})$ (1)

Combining $eV$ and the photoelectric effect equation gets MP1.`,
  [[2, 0.36, 0.905]], m(4, 0.39, 0.53));

// Q2
S("2", 3, r`Laser light of wavelength $6.94\times10^{-7}\,\text{m}$ is incident normally on a diffraction grating.

The grating has $280$ lines per millimetre.

Bright spots appear on a semicircular screen, as shown in **Figure 1**.

Calculate the total number of bright spots that appear on the screen.`, 5, "Diffraction", "MEDIUM", ["diffraction grating", "maximum order", "number of maxima", "grating spacing", "d sin theta"], 3,
  [[3, 0.30, 0.165, 0.69, 0.40]],
  r`Any two from (1)(1):

- Uses $d = \dfrac{10^{-3}}{280}$ or equivalent (expect $3.6\times10^{-6}$; condone POT error)
- Uses $d\sin\theta = n\lambda$ (with $\theta = 90^\circ$) **OR** $n\lambda = d$ to find $n$ (rearrangement or correct substitution for MP2)
- Doubles their $n$ and adds 1

$11$ (1)

$n$ must be an integer for the final answer; full marks for correct final answer $= 11$ bright spots.`,
  [[3, 0.08, 0.905]], m(5, 0.20, 0.42));

// Q3
T("3(a)", 1, r`A wave on the surface of water is used to model the behaviour of light waves.

**Figure 2** shows the wave travelling on the surface of water, as viewed from above. The boundary between a deep region **D** and a shallow region **S** is shown.

The wave travels more slowly in shallow water than in deep water.

Explain why the wavelength of the wave is greater in region **D** than in region **S**.`, 5, "Progressive waves", "EASY", ["wave speed", "wavelength", "frequency", "wave equation", "refraction"], 4,
  [[4, 0.20, 0.145, 0.78, 0.52]],
  r`Reference to wave equation **AND** frequency stays the same (1)

Accept proportionality statement for the wave equation, or reverse argument.`,
  [[4, 0.08, 0.705]], m(6, 0.20, 0.295));
S("3(b)", 1, r`The speed of the wave in region **D** is $v_{\text{D}}$. The speed of the wave in region **S** is $v_{\text{S}}$.

The ratio of the speeds is given by:

$$\frac{v_{\text{D}}}{v_{\text{S}}} = \frac{\sin\theta_{\text{S}}}{\sin\theta_{\text{D}}}$$

where $\theta_{\text{D}}$ is the wave's angle of incidence in region **D** and $\theta_{\text{S}}$ is the wave's angle of refraction in region **S**.

Calculate $\dfrac{v_{\text{D}}}{v_{\text{S}}}$.`, 5, "Refraction at a plane surface", "EASY", ["refraction", "wave speed ratio", "angle of incidence", "angle of refraction", "snell's law"], 5, [],
  r`$\left(\dfrac{\sin53}{\sin31} = \right)\ 1.6$ (1) $(1.55)$

Due to an error in the question paper, this item was discounted and all candidates were awarded one mark.`,
  [[5, 0.08, 0.39]], m(6, 0.395, 0.54), { conf: 0.7 });

// Q4
S("4(a)", 2, r`This question is about a child moving on a swing.

**C** is the centre of mass of the child and seat. $h$ is the height of **C** above the ground.

**Figure 3** shows **C** at two different values of $h$.

At time $t = 0$ the child starts swinging. **Figure 4** shows the variation of $h$ with $t$.

Determine the time period of the oscillation.

Go on to explain how you used **Figure 4** to determine your answer.`, 5, "Oscillating systems", "MEDIUM", ["time period", "pendulum", "swing", "oscillation graph", "maxima"], 6,
  [[6, 0.27, 0.185, 0.71, 0.445], [6, 0.18, 0.495, 0.80, 0.86]],
  r`- $2.5\,(\text{s})$ (1)
- Idea that there are two maxima/minima (of energy/of height) in one period (1)

If no other mark awarded, condone for 1 mark $1.25\,\text{s}$ and idea of the time between adjacent peaks/troughs (of energy/height).`,
  [[6, 0.08, 0.86], [7, 0.08, 0.44]], m(7, 0.20, 0.35), { pages: [6, 7] });
S("4(b)", 2, r`$L$ is the distance from **C** to the suspension point of the swing.

Assume that the time period of the swing is the same as the time period for a simple pendulum of length $L$.

Estimate $L$.`, 5, "Oscillating systems", "MEDIUM", ["simple pendulum", "length", "time period", "estimate", "acceleration due to gravity"], 7, [],
  r`- Use of $T = 2\pi\sqrt{\dfrac{l}{g}}$ (1)
- $1.6\,(\text{m})$ (1)

ecf from 4(a) for both marks.`,
  [[7, 0.455, 0.81]], m(7, 0.445, 0.545));
T("4(c)", 1, r`Suggest **one** reason why the swing does not behave in exactly the same way as a simple pendulum.`, 5, "Oscillating systems", "EASY", ["damping", "simple pendulum", "small angle", "air resistance", "driven oscillation"], 8, [],
  r`Any one from (1):

- the motion is damped / there is air resistance / friction
- the motion is driven / the child kicks her legs / the child shifts her centre of mass (relative to the seat) (accept "the child shifts her weight")
- the angle of oscillation is not small
- the child is not a point mass / mass of chain is significant
- the chain does not stay taut`,
  [[8, 0.08, 0.23]], m(7, 0.64, 0.855));
S("4(d)", 3, r`Sketch, on **Figure 5**, the variation of the child's kinetic energy with $t$ for the first $2.5\,\text{s}$ of the motion.

Do not add values to the kinetic energy axis.`, 5, "Oscillating systems", "HARD", ["kinetic energy", "energy in oscillations", "damping", "sketch graph", "pendulum"], 8,
  [[8, 0.18, 0.325, 0.80, 0.685]],
  r`- Sinusoidal shape (1) (requires a flat gradient at peaks and troughs, and a constant period)
- Decreasing peaks (1)
- Minima touching $x$-axis at $0$, $1.25$, $2.5\,\text{s}$; maxima halfway between these points (1) (correct to quarter of a grid square by eye)`,
  [[8, 0.245, 0.69]], m(8, 0.20, 0.38), { conf: 0.85 });

// Q5
T("5(a)", 2, r`Explain why longitudinal waves cannot be polarised but transverse waves can be polarised.`, 5, "Longitudinal and transverse waves", "MEDIUM", ["polarisation", "longitudinal waves", "transverse waves", "oscillation direction", "plane of oscillation"], 9, [],
  r`- Defines polarisation **OR** describes longitudinal/transverse (1)
- Both, with some link (may be implied) (1)

(Plane) polarisation is when the direction of oscillation is restricted to a certain plane (perpendicular to the direction of propagation of the wave). The idea that there are no oscillations perpendicular (to the direction of propagation) in longitudinal waves / only transverse waves have oscillations perpendicular (to the direction of propagation).`,
  [[9, 0.08, 0.32]], m(9, 0.20, 0.485));
T("5(b)", 2, r`**Figure 6** shows an early form of mobile phone. The antenna on this mobile phone was a long thin metal rod that received microwave signals.

Explain why the microwaves transmitted to the mobile phone must **not** be polarised in a single plane.`, 5, "Longitudinal and transverse waves", "MEDIUM", ["polarisation", "microwaves", "antenna", "orientation", "mobile phone"], 9,
  [[9, 0.29, 0.385, 0.79, 0.635]],
  r`- Idea of aligning receiver/antenna with (polarised) signal (for signal transmission) (1)
- Idea that mobile phones can be held in different orientations (1)

Ignore idea that phone must receive signal from different directions.`,
  [[9, 0.34, 0.885]], m(9, 0.58, 0.71));

// Q6
S("6(a)", 1, r`This question is about two electrical cells **A** and **B**.

**Figure 7** shows the variation of terminal pd $V$ with current $I$ for cell **A**.

Determine the emf of **A**.`, 4, "Electromotive force and internal resistance", "EASY", ["emf", "terminal pd", "y-intercept", "cell", "graph reading"], 10,
  [[10, 0.18, 0.135, 0.80, 0.495]],
  r`Read-off $= 1.6(0)\,(\text{V})$ (1)`,
  [[10, 0.08, 0.625]], m(10, 0.20, 0.25));
S("6(b)", 3, r`Determine the internal resistance of **A**.`, 4, "Electromotive force and internal resistance", "MEDIUM", ["internal resistance", "gradient", "terminal pd", "current", "emf"], 10, [],
  r`- Deriving $r$ algebraically **OR** relating $r$ to $V_{\text{max}}$, $I_{\text{max}}$ **OR** relating $r$ to gradient (1)
- Gradient/correct ratio determined using points far apart (1) (expect e.g. $\dfrac{(-)1.6}{8.6}$)
- $0.19\,(\Omega)$ (1)

ecf on 6(a).`,
  [[10, 0.645, 0.89]], m(10, 0.34, 0.49));
T("6(c)", 2, r`Cell **B** has the same emf as cell **A**. **B** has a much smaller internal resistance than **A**.

**A** is connected across a lamp. **B** is connected across an identical lamp.

Explain any difference between the brightness of the lamps.

Calculations are not required.`, 4, "Electromotive force and internal resistance", "MEDIUM", ["internal resistance", "lost volts", "terminal pd", "lamp brightness", "power"], 11, [],
  r`Lamp with **B** is brighter because, any two (1)(1):

- less lost volts
- higher terminal pd / higher pd across the lamp
- less total resistance
- greater current
- valid application of a power equation`,
  [[11, 0.08, 0.535]], m(11, 0.20, 0.42));

// Q7
S("7(a)", 1, r`**Figure 8** shows apparatus used to demonstrate refraction.

A glass measuring cylinder has a small hole on one side, at height $h$. The teacher shines red laser light horizontally at height $h$ through the wall of the empty cylinder. The light passes through the hole and a red spot appears on a screen at height $h$.

The hole is covered and the cylinder is filled with water. The hole is then uncovered and a jet of water comes out of the hole.

The red spot disappears from the screen and appears on the table as shown in **Figure 9**.

Sketch, on **Figure 9**, the path of the light through the water jet.`, 5, "Refraction at a plane surface", "MEDIUM", ["total internal reflection", "water jet", "laser", "light guide", "critical angle"], 12,
  [[12, 0.13, 0.185, 0.85, 0.485], [13, 0.13, 0.175, 0.85, 0.505]],
  r`Sketch shows the light totally internally reflecting multiple times in the water jet (1)

Lines must be straight, judged by eye. Reject if ray leaves water jet.`,
  [[12, 0.08, 0.49], [13, 0.08, 0.555]], m(11, 0.645, 0.725), { pages: [12, 13] });
S("7(b)", 1, r`**Figure 10** shows the water jet when there is less water in the cylinder.

At a particular water level, the red spot disappears from the table and reappears on the screen.

Draw, on **Figure 10**, the new path of the light from the hole to the screen.`, 5, "Refraction at a plane surface", "MEDIUM", ["refraction", "water-air boundary", "ray diagram", "laser", "water jet"], 14,
  [[14, 0.13, 0.14, 0.85, 0.445]],
  r`Line travels straight to waterâ€“air boundary, then refracts downwards at boundary then travels straight to screen (1)`,
  [[14, 0.08, 0.495]], m(12, 0.20, 0.27), { conf: 0.85 });
T("7(c)", 3, r`Explain why the spot disappears from the table and reappears in the position you drew on **Figure 10**.`, 5, "Refraction at a plane surface", "HARD", ["critical angle", "total internal reflection", "angle of incidence", "refraction", "refractive index"], 14, [],
  r`- The angle of incidence of the light (decreases and) becomes less than the critical angle (1)
- so the light refracts (out of the water) / no longer totally internally reflects (1)
- Comparison of speeds of light or refractive indices **AND** comparison of angle of incidence and angle of refraction (1)

Accept e.g. "light speeds up in air so it bends away from the normal".`,
  [[14, 0.515, 0.86]], m(12, 0.36, 0.55));
T("7(d)", 1, r`State **one** safety measure when using a laser in a school laboratory.`, 1, "Practical and analytical skills", "EASY", ["laser safety", "laboratory safety", "eye protection", "risk", "practical"], 15, [],
  r`Any one from (1):

- put a warning sign on the door
- idea of not using lasers at eye level
- do not point lasers at the audience
- direct lasers at a screen
- keep lasers stored safely (locked etc.)
- use lasers with an "on" button that must be held down
- use non-reflective screen

Condone laser eye protection goggles (not simply "goggles"); condone stand behind the laser. Ignore "do not look at the laser (beam) directly".`,
  [[15, 0.08, 0.21]], m(13, 0.20, 0.44));

// Q8
T("8(a)", 2, r`Describe **two** differences between the properties of a stationary wave and the properties of a progressive wave.`, 5, "Superposition of waves and stationary waves", "EASY", ["stationary waves", "progressive waves", "nodes", "antinodes", "energy transfer", "phase"], 15, [],
  r`Any two from (1)(1):

- energy is transferred along a progressive wave, but is stored/not transferred in a stationary wave
- the phase of the oscillations varies continuously along a progressive wave, but is constant between two adjacent nodes/antinodes in a stationary wave
- stationary waves have nodes/antinodes, while progressive waves do not **OR** the peaks and troughs (or compressions, rarefactions) move in a progressive wave but don't in a stationary wave
- a progressive wave can have the same amplitude at all points whereas the amplitude varies along a stationary wave`,
  [[15, 0.235, 0.54]], m(14, 0.20, 0.555));
T("8(b)", 6, r`**Figure 11** shows the apparatus that a student uses to investigate stationary waves on a string.

The string is attached to a vibration generator at one end and hangs over a pulley at the other end. A selection of different masses is available to change the tension in the string.

The vibrating length $L$ of the string cannot be changed.

The frequency of the vibration generator is increased from zero until the first-harmonic stationary wave is observed on the string.

Describe a suitable method to determine the mass per unit length $\mu$ of the string using this apparatus.

In your answer, include:

- the measurements to be taken, including details of the measuring instruments used
- techniques to reduce the uncertainty in the experiment
- how $\mu$ is determined using a graphical method.`, 5, "Superposition of waves and stationary waves", "HARD", ["stationary waves", "first harmonic", "mass per unit length", "tension", "graphical method", "required practical"], 16,
  [[16, 0.22, 0.11, 0.75, 0.412]],
  r`Levels of response (6 marks).

**Indicative content**

*Measurements to be taken, including instruments:*
- measure (hanging) mass with mass balance or weight with newtonmeter (condone use of known masses)
- measure $L$ with ruler or tape measure
- vary (hanging) mass or tension
- measure $f$ for a harmonic using the signal generator

*Techniques to reduce uncertainty (two of the following):*
- at least 6 values of (hanging) mass used
- repeat determination of $f$ and average / remove anomalies
- idea of increasing frequency slowly past harmonic then back again
- method of reducing parallax error in determination of $L$
- idea of reducing friction in pulley

*How $\mu$ is determined graphically:*
- calculate $T$ using $T = mg$ (unless newtonmeter used)
- valid combination of $x$ and $y$ variables for axes
- algebraic manipulation of $f = \dfrac{1}{2L}\sqrt{\dfrac{T}{\mu}}$ into the form $y = mx + c$ (may be implied)
- express $\mu$ in terms of the gradient

Accept answers in terms of any harmonic.

**Levels**
- **6**: All three areas covered with at least two aspects covered in some detail (full marks possible even with an error and/or parts of one aspect missing).
- **5**: A fair attempt to analyse all three areas, with two areas covered successfully and one partially.
- **4**: Two areas fully covered, or one fully covered and two others covered partially; several gaps but only an occasional error.
- **3**: One area fully covered and one covered partially, or all three covered partially; likely several errors and omissions.
- **2**: Only one area fully covered or a partial attempt at two areas.
- **1**: One area partially covered.
- **0**: No relevant comments.`,
  [[16, 0.08, 0.91], [17, 0.08, 0.555]], m(15, 0.20, 0.90), { pages: [16, 17] });
T("8(c)", 1, r`When the student repeats the experiment, his measurements of the first-harmonic frequency vary at each tension. This is partly due to a random error in identifying the first harmonic.

Explain why using the second harmonic would reduce the random error.`, 5, "Superposition of waves and stationary waves", "MEDIUM", ["second harmonic", "node", "antinode", "random error", "stationary waves"], 17, [],
  r`Idea that the second harmonic has a node (in the centre) and it is easier to observe a node than an antinode (1)

Ignore "more nodes".`,
  [[17, 0.565, 0.765]], m(16, 0.20, 0.27));

// Q9
T("9(a)", 3, r`Explain how line spectra provide evidence that gas atoms have discrete energy levels.`, 5, "Collisions of electrons with atoms", "MEDIUM", ["line spectra", "energy levels", "photon emission", "discrete", "excitation"], 18, [],
  r`Max two of (1)(1):

- idea that atoms de-excite and emit photons **OR** atoms absorb photons and excite
- photon energy is equal to the energy of each transition
- link between energy of photon and wavelength/frequency (may be in the form of an equation)

Idea that only specific wavelengths/frequencies are emitted/absorbed (1)

Condone electrons for atoms. Explanation must be in terms of photons for MP1/2. For MP3, need the idea of what "discrete" means, e.g. specific, certain, quantised.`,
  [[18, 0.08, 0.395]], m(17, 0.20, 0.465));
S("9(b)", 4, r`**Figure 12** shows the lowest energy levels of atomic hydrogen.

Determine the transition that emits light with a wavelength of $656\,\text{nm}$.`, 5, "Collisions of electrons with atoms", "MEDIUM", ["energy levels", "hydrogen", "photon wavelength", "electronvolt", "transition"], 18,
  [[18, 0.27, 0.435, 0.71, 0.75]],
  r`Any three from (1)(1)(1):

- use of $E = \dfrac{hc}{\lambda}$
- converts from eV to J correctly or vice versa at any time
- determines $1.9\,\text{eV}$ using the wavelength
- shows $-1.51 - (-3.39)\,\text{eV} = 1.9\,\text{eV}$ (ignore signs in the subtraction)

Concludes level 3 to level 2 (1)

Some valid working required for full marks.`,
  [[18, 0.41, 0.75], [19, 0.08, 0.485]], m(17, 0.565, 0.795), { pages: [18, 19] });
S("9(c)", 1, r`A beam of photons, each of energy $12.75\,\text{eV}$, is incident on hydrogen atoms that are in level 1.

Determine the number of different photon energies that are emitted by the hydrogen atoms.`, 5, "Collisions of electrons with atoms", "HARD", ["excitation", "energy levels", "photon absorption", "emission lines", "hydrogen"], 19, [],
  r`$6$ (1)`,
  [[19, 0.50, 0.715]], m(18, 0.20, 0.26));

// Q10 (practical)
S("10(a)", 1, r`A student is asked to determine the volume of a wire that has a circular cross-section.

She makes six measurements of the diameter $d$ of the wire.

**Table 1** shows the measurements of $d$ obtained by the student.

Suggest a suitable measuring instrument to measure $d$.`, 1, "Practical and analytical skills", "EASY", ["micrometer", "diameter", "measuring instrument", "wire", "resolution"], 20,
  [[20, 0.19, 0.235, 0.78, 0.32]],
  r`Micrometer (screw gauge) / digital (Vernier) calipers (1)`,
  [[20, 0.145, 0.40]], m(18, 0.465, 0.51));
T("10(b)", 1, r`Describe how to minimise the systematic error when making these measurements.`, 1, "Limitation of physical measurements", "EASY", ["systematic error", "zero error", "micrometer", "calipers", "measurement"], 20, [],
  r`Fully close micrometer/calipers and then zero before taking readings **OR** take reading of micrometer/calipers fully closed and subtract zero error from measurements (1)

Condone: check for zero error and idea of removing it (numerically or practically). Must have the idea of the two operations.`,
  [[20, 0.42, 0.56]], m(18, 0.61, 0.77));
T("10(c)", 1, r`Explain why the student makes measurements of $d$ in more than one position along the wire.`, 1, "Practical and analytical skills", "EASY", ["repeat measurements", "uniform thickness", "circular cross-section", "diameter", "wire"], 20, [],
  r`Idea of determining whether wire has circular cross-section/uniform thickness (1)

Accept idea that the wire does not have circular cross-section/uniform thickness.`,
  [[20, 0.575, 0.73]], m(19, 0.20, 0.255));
S("10(d)", 3, r`The student uses **Table 1** to determine an accurate value for the cross-sectional area of the wire.

Calculate the percentage uncertainty in the cross-sectional area of the wire.`, 1, "Limitation of physical measurements", "MEDIUM", ["percentage uncertainty", "anomaly", "half range", "cross-sectional area", "mean"], 21, [],
  r`Any two from (1)(1):

- calculates mean $d$ having removed anomaly (expect $0.17\,\text{mm}$)
- uses $\dfrac{\frac{1}{2}\text{range}}{\text{their } d}\,(\times100)$ to find % uncertainty in $d$
- $2\times$ their % uncertainty in $d$ to find uncertainty in $A$

$12\%$ (1)

Only first bullet point and final answer require anomaly to be removed. 1 or 2 sig fig only for final mark.`,
  [[21, 0.08, 0.365]], m(19, 0.355, 0.58));
S("10(e)", 2, r`The length of the wire is measured as $8.3\,\text{cm} \pm 0.1\,\text{cm}$.

Calculate the percentage uncertainty in the volume of the wire.`, 1, "Limitation of physical measurements", "MEDIUM", ["percentage uncertainty", "volume", "length", "combining uncertainties", "wire"], 21, [],
  r`- % uncertainty in length $(= 1(.2)\%)$ (1)
- (adds the percentage uncertainties) $= 13\%$ (1)

Ecf on 10(d). No sig fig penalty here.`,
  [[21, 0.385, 0.605]], m(19, 0.68, 0.785));

// Q11
S("11(a)", 3, r`A student designs a circuit to indicate the water temperature for a child's bath. A light in the circuit turns on when the bath water is above a certain temperature.

The student puts the circuit inside a floating toy as shown in **Figure 13**.

**Figure 14** shows part of the circuit. This part contains a battery, a thermistor and a variable resistor **R**.

The battery has an emf of $3.0\,\text{V}$ and negligible internal resistance.

The part of the circuit containing the indicator light is connected between **A** and **B**. This part of the circuit is not shown and does not affect the voltage $V_{\text{AB}}$ between **A** and **B**.

Whenever $V_{\text{AB}}$ is greater than $0.65\,\text{V}$, the indicator light turns on.

**Figure 15** shows the variation of resistance with temperature for the thermistor.

The resistance of **R** is set so that $V_{\text{AB}}$ is $0.65\,\text{V}$ when the temperature is $37\,^\circ\text{C}$.

Calculate the resistance of **R** at this setting.`, 4, "Potential divider", "MEDIUM", ["potential divider", "thermistor", "variable resistor", "sensor circuit", "graph reading"], 22,
  [[22, 0.25, 0.145, 0.72, 0.36], [22, 0.26, 0.435, 0.71, 0.655], [23, 0.17, 0.095, 0.80, 0.53]],
  r`- Read-off from Figure 15 for $37\,^\circ\text{C}$ ($7.5$ to $8.0\,\text{k}\Omega$) (1)
- Use of potential divider equation or other valid method to find $R$ (1)
- Answer that rounds to $2100$â€“$2200\,\Omega$ (1)

Allow POT error for MP1, 2. If current is calculated, expect $2.9$ to $3.1\times10^{-4}\,\text{A}$.`,
  [[22, 0.08, 0.755], [23, 0.08, 0.85]], m(20, 0.20, 0.345), { pages: [22, 23] });
T("11(b)", 3, r`The student increases the resistance of **R**.

Explain the effect on the temperature at which the indicator light turns on.`, 4, "Potential divider", "HARD", ["potential divider", "thermistor", "threshold voltage", "temperature", "variable resistor"], 24, [],
  r`- **R** has a larger share of the voltage (for any particular temperature) **OR** the current in the circuit decreases **OR** idea of maintaining voltage ratio (1)
- Idea that the voltage of the thermistor is decreased (for the same resistance) **OR** the resistance of the thermistor needs to be higher (for the same pd) (1)
- Idea that the threshold voltage is reached / the indicator light turns on at a lower temperature (1)

For MP1, allow clear algebraic argument.`,
  [[24, 0.08, 0.445]], m(20, 0.44, 0.67));
T("11(c)", 1, r`Explain the benefit of using **R** in the circuit instead of a resistor of fixed resistance.`, 4, "Potential divider", "EASY", ["variable resistor", "threshold temperature", "adjustable", "sensor circuit", "potential divider"], 24, [],
  r`Idea that a different threshold temperature / bathwater temperature can be chosen (1)`,
  [[24, 0.465, 0.60]], m(20, 0.765, 0.85));
T("11(d)", 1, r`Explain whether the part of the circuit between **A** and **B** must have a very high resistance or a very low resistance.`, 4, "Potential divider", "MEDIUM", ["parallel resistance", "loading", "potential divider", "high resistance", "output voltage"], 24, [],
  r`Very high resistance **AND** idea that it does not affect the current/resistance of parallel section (1)

Accept "so it does not affect $V_{\text{AB}}$".`,
  [[24, 0.62, 0.775]], m(21, 0.20, 0.33));

// Section C
M("12", r`When two resistors are connected together, the total resistance of the combination is $10\,\Omega$.

One resistor has a resistance of $12\,\Omega$.

What is the resistance of the other resistor?`,
  [r`$2.0\,\Omega$`, r`$5.5\,\Omega$`, r`$17\,\Omega$`, r`$60\,\Omega$`], "D", 4, "Circuits", ["resistors in parallel", "total resistance", "combination", "reciprocal", "resistance"], 25,
  [], [[25, 0.43, 0.70]], mq(22, 0.19, 0.235));
M("13", r`The graph shows the $I$â€“$V$ characteristic of a filament lamp **L**.

An identical lamp is connected in parallel with **L**.

The voltage across the parallel combination is $6.0\,\text{V}$.

What is the total power dissipated by the two lamps?`,
  [r`$0.42\,\text{W}$`, r`$0.65\,\text{W}$`, r`$0.90\,\text{W}$`, r`$1.3\,\text{W}$`], "D", 4, "Current-voltage characteristics", ["filament lamp", "i-v characteristic", "power", "parallel", "graph reading"], 26,
  [[26, 0.13, 0.10, 0.85, 0.43]], [[26, 0.08, 0.67]], mq(22, 0.235, 0.28));
M("14", r`A superconducting component **S** is placed in series with a resistor of resistance $R$.

The voltage across the combination is $V$.

Which row is correct?`,
  [r`Current in S: $\dfrac{V}{R}$; voltage across S: $0$; voltage across the resistor: $V$`, r`Current in S: $\dfrac{V}{R}$; voltage across S: $\dfrac{V}{2}$; voltage across the resistor: $\dfrac{V}{2}$`, r`Current in S: infinite; voltage across S: $0$; voltage across the resistor: $V$`, r`Current in S: infinite; voltage across S: $\dfrac{V}{2}$; voltage across the resistor: $\dfrac{V}{2}$`], "A", 4, "Resistivity", ["superconductor", "zero resistance", "series circuit", "potential difference", "current"], 27,
  [], [[27, 0.08, 0.395]], mq(22, 0.28, 0.365));
M("15", r`Two resistors $\text{R}_1$ and $\text{R}_2$ are connected in series.

The resistor values are:

$\text{R}_1 = 14\,\Omega \pm 20\%$

$\text{R}_2 = 30\,\Omega \pm 10\%$

What is the absolute uncertainty of the total resistance of the series combination?`,
  [r`$13\,\Omega$`, r`$9\,\Omega$`, r`$7\,\Omega$`, r`$6\,\Omega$`], "D", 1, "Limitation of physical measurements", ["absolute uncertainty", "percentage uncertainty", "series resistors", "combining uncertainties", "tolerance"], 27,
  [], [[27, 0.42, 0.715]], mq(22, 0.365, 0.41));
M("16", r`A potential difference is applied across a variable resistor.

The current in the variable resistor is $I$. The power dissipated by the variable resistor is $P$.

The resistance of the variable resistor is increased by $15\%$. The same potential difference is applied.

Which row shows the new current and the new power?`,
  [r`Current $0.87I$; power $0.87P$`, r`Current $0.87I$; power $1.15P$`, r`Current $0.85I$; power $0.85P$`, r`Current $0.85I$; power $1.15P$`], "A", 4, "Basics of electricity", ["power", "current", "resistance", "potential difference", "proportion"], 28,
  [], [[28, 0.08, 0.41]], mq(22, 0.41, 0.45));
M("17", r`An oscillating system consists of an object of mass $M$ suspended from a spring of stiffness $k$.

The object is displaced vertically and released. The system oscillates freely with a frequency $f$.

An object of mass $2M$ is suspended from a spring of stiffness $3k$.

What is the frequency of oscillation of this system?`,
  [r`$1.5f$`, r`$1.2f$`, r`$0.82f$`, r`$0.67f$`], "B", 5, "Oscillating systems", ["mass-spring system", "frequency", "spring stiffness", "mass", "simple harmonic motion"], 28,
  [], [[28, 0.44, 0.73]], mq(22, 0.45, 0.495));
M("18", r`A transverse wave travels along a string.

The transverse wave has a frequency of $2.0\,\text{Hz}$, a wavelength of $4.0\,\text{cm}$ and an amplitude of $3.0\,\text{cm}$.

What is the total distance travelled by a point on the string in one second?`,
  [r`$6.0\,\text{cm}$`, r`$8.0\,\text{cm}$`, r`$12\,\text{cm}$`, r`$24\,\text{cm}$`], "D", 5, "Progressive waves", ["amplitude", "frequency", "particle motion", "transverse wave", "distance travelled"], 29,
  [], [[29, 0.08, 0.335]], mq(22, 0.495, 0.54));
M("19", r`Two aerials $\text{A}_1$ and $\text{A}_2$ receive radio waves from the same distant transmitter **T**.

The distance between $\text{A}_1$ and **T** is $d_1$.

The distance between $\text{A}_2$ and **T** is $d_2$.

The waves have a frequency of $104\,\text{MHz}$.

The phase difference between the waves received by $\text{A}_1$ and $\text{A}_2$ is $1.4\,\text{rad}$.

What is the minimum value for $d_1 - d_2$?`,
  [r`$0.32\,\text{m}$`, r`$0.64\,\text{m}$`, r`$1.3\,\text{m}$`, r`$13\,\text{m}$`], "B", 5, "Progressive waves", ["phase difference", "path difference", "radio waves", "wavelength", "radians"], 29,
  [], [[29, 0.37, 0.69]], mq(22, 0.54, 0.585), "HARD");
M("20", r`Light from a single monochromatic source is incident on a Young's double-slit apparatus.

Fringes with spacing $y$ are observed on a screen.

The slit separation and the distance between the slits and the screen are both doubled.

What is the new fringe spacing?`,
  [r`$4y$`, r`$2y$`, r`$y$`, r`$\dfrac{y}{2}$`], "C", 5, "Interference", ["young's double slit", "fringe spacing", "slit separation", "screen distance", "interference"], 30,
  [], [[30, 0.08, 0.36]], mq(22, 0.585, 0.63), "EASY");
M("21", r`Ultraviolet light is incident on a metal surface.

$N$ electrons per second are emitted from the surface.

The maximum kinetic energy of the emitted electrons is $E_{\text{k(max)}}$.

The frequency of the light is now increased while the power of the light is kept the same.

What happens to $N$ and $E_{\text{k(max)}}$?`,
  [r`$N$: decreases; $E_{\text{k(max)}}$: increases`, r`$N$: decreases; $E_{\text{k(max)}}$: stays the same`, r`$N$: increases; $E_{\text{k(max)}}$: increases`, r`$N$: increases; $E_{\text{k(max)}}$: stays the same`], "A", 5, "Photoelectric effect", ["photoelectric effect", "frequency", "intensity", "photon flux", "maximum kinetic energy"], 30,
  [], [[30, 0.395, 0.72]], mq(22, 0.63, 0.675));
M("22", r`Light travels with a speed $v$ in the core of an optical fibre of length $L$.

The longest path is at an angle $\theta$ to the central axis of the fibre.

The shortest path is along the central axis of the fibre.

What is the difference between the times taken for the light to travel along the longest path and along the shortest path?`,
  [r`$\dfrac{L}{v}\left(\dfrac{1}{\sin\theta} - 1\right)$`, r`$\dfrac{L}{v}(1 - \sin\theta)$`, r`$\dfrac{L}{v}\left(\dfrac{1}{\cos\theta} - 1\right)$`, r`$\dfrac{L}{v}(1 - \cos\theta)$`], "C", 5, "Refraction at a plane surface", ["optical fibre", "modal dispersion", "path length", "time difference", "core"], 31,
  [[31, 0.15, 0.14, 0.85, 0.29]], [[31, 0.08, 0.635]], mq(22, 0.675, 0.74), "HARD");
M("23", r`The refractive indices of some materials are given below.

Materials are chosen for the core and cladding of a step-index optical fibre.

Which combination results in the least modal dispersion?`,
  ["Core: Teflon; cladding: sapphire", "Core: sapphire; cladding: Teflon", "Core: acrylic; cladding: Teflon", "Core: Teflon; cladding: acrylic"], "C", 5, "Refraction at a plane surface", ["optical fibre", "modal dispersion", "core", "cladding", "refractive index", "critical angle"], 32,
  [[32, 0.32, 0.11, 0.66, 0.26]], [[32, 0.08, 0.525]], mq(22, 0.74, 0.785), "HARD");
M("24", r`The purpose of the powder coating in a fluorescent tube is to absorb one type of particle and emit another type of particle.

Which row is correct?`,
  ["Absorbed: ultraviolet photons; emitted: electrons", "Absorbed: ultraviolet photons; emitted: visible photons", "Absorbed: electrons; emitted: visible photons", "Absorbed: electrons; emitted: ultraviolet photons"], "B", 5, "Collisions of electrons with atoms", ["fluorescent tube", "fluorescence", "ultraviolet photons", "visible light", "phosphor coating"], 32,
  [], [[32, 0.545, 0.83]], mq(22, 0.785, 0.825), "EASY");
M("25", r`A beam of electrons is diffracted, creating a diffraction pattern consisting of bright circles.

The momentum of each electron is then decreased.

The number of electrons emitted per second in the beam stays the same.

Which row shows what happens to the de Broglie wavelength of the electrons and the diameter of the bright circles?`,
  ["de Broglie wavelength: increases; diameter: decreases", "de Broglie wavelength: increases; diameter: increases", "de Broglie wavelength: decreases; diameter: decreases", "de Broglie wavelength: decreases; diameter: increases"], "B", 5, "Wave-particle duality", ["electron diffraction", "de broglie wavelength", "momentum", "wave-particle duality", "diffraction rings"], 33,
  [[33, 0.34, 0.105, 0.635, 0.265]], [[33, 0.08, 0.56]], mq(22, 0.825, 0.865));

P.write();

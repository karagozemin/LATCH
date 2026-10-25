import {
	SCENARIOS,
	scenarioById,
	experienceSnapshot,
	transitionExperience,
	type ExperiencePhase,
	type Scenario,
} from "./experience-model";
import { getNetwork, requestAccess } from "@stellar/freighter-api";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => {
	const element = document.querySelector<T>(selector);
	if (!element) throw new Error(`Missing experience element: ${selector}`);
	return element;
};
const format = (cents: number) => (cents / 100).toFixed(2);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

type ProtocolModule = typeof import("./protocol");

export function initExperience(loadProtocol: () => Promise<ProtocolModule>) {
	const landing = $("#landing");
	const application = $("#application");
	const experienceView = $("#experience-view");
	const protocolView = $("#protocol-view");
	const experienceMain = $(".experience-main");
	const scene = $("#experience-scene");
	const wallet = $("#experience-wallet");
	const insight = $("#experience-insight");
	const transition = $("#entry-transition");
	const main = $("#main");
	const heroArt = $("#hero-art");
	const heroTrigger = $("#hero-promise-trigger") as HTMLButtonElement;
	const fxLayer = $("#fx-layer");
	const toast = $("#toast");
	let scenario: Scenario = SCENARIOS[0];
	let phase: ExperiencePhase = "ready";
	let finalAmount = scenario.actual;
	let transitionTimer = 0;
	let lastRoute = "";
	let heroLatched = false;
	let toastTimer = 0;
	let liveModeActive = false;
	let livePrepared = false;
	let walletConnected = false;
	experienceMain.append(protocolView);

	const liveAmounts: Record<
		Scenario["id"],
		{ maximum: number; capture: number }
	> = {
		hotel: { maximum: 30, capture: 16.8 },
		fuel: { maximum: 15, capture: 9.36 },
		studio: { maximum: 20, capture: 13.5 },
	};

	function configureLiveExperience(module: ProtocolModule) {
		const amount = liveAmounts[scenario.id];
		module.configureLiveExperience({
			merchantName: scenario.merchant,
			merchantMark: scenario.merchant.slice(0, 1).toUpperCase(),
			maximum: amount.maximum,
			capture: amount.capture,
			reference: scenario.reference,
		});
	}

	function liveRoute() {
		return `app/${scenario.id}/live`;
	}

	function flowMaximum() {
		return liveModeActive
			? liveAmounts[scenario.id].maximum * 100
			: scenario.maximum;
	}

	function flowActual() {
		return liveModeActive
			? liveAmounts[scenario.id].capture * 100
			: scenario.actual;
	}

	function flowAsset() {
		return liveModeActive ? "XLM" : "LUSD";
	}

	function currentSnapshot() {
		if (!liveModeActive)
			return experienceSnapshot(scenario, phase, finalAmount);
		const maximum = flowMaximum();
		const startingBalance = 5_000;
		const reserved =
			phase === "reserved" || phase === "delivered" ? maximum : 0;
		const paid = phase === "settled" ? finalAmount : 0;
		return {
			balance: startingBalance - paid,
			available: startingBalance - paid - reserved,
			reserved,
			paid,
			released:
				phase === "settled"
					? maximum - paid
					: phase === "released" || phase === "expired"
						? maximum
						: 0,
		};
	}

	function showToast(message: string) {
		window.clearTimeout(toastTimer);
		toast.textContent = message;
		toast.classList.add("show");
		toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2200);
	}

	function animateNumber(element: HTMLElement, from: number, to: number) {
		if (reducedMotion.matches) {
			element.textContent = to.toFixed(2);
			return;
		}
		const started = performance.now();
		const duration = 520;
		const tick = (now: number) => {
			const progress = Math.min(1, (now - started) / duration);
			const eased = 1 - (1 - progress) ** 3;
			element.textContent = (from + (to - from) * eased).toFixed(2);
			if (progress < 1) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	function burst(rect: DOMRect, blocked = false) {
		if (!reducedMotion.matches) {
			for (let index = 0; index < 18; index += 1) {
				const particle = document.createElement("i");
				const angle = (Math.PI * 2 * index) / 18;
				const distance = 35 + (index % 5) * 12;
				particle.className = `fx-particle${blocked ? " is-blocked" : ""}`;
				particle.style.left = `${rect.left + rect.width / 2}px`;
				particle.style.top = `${rect.top + rect.height / 2}px`;
				particle.style.setProperty("--fx-x", `${Math.cos(angle) * distance}px`);
				particle.style.setProperty("--fx-y", `${Math.sin(angle) * distance}px`);
				particle.style.animationDelay = `${(index % 4) * 18}ms`;
				fxLayer.append(particle);
				window.setTimeout(() => particle.remove(), 850);
			}
		}
		navigator.vibrate?.(blocked ? [18, 25, 18] : 24);
	}

	function reward(rect: DOMRect, message: string) {
		burst(rect);
		wallet.classList.remove("is-rewarded");
		requestAnimationFrame(() => wallet.classList.add("is-rewarded"));
		window.setTimeout(() => wallet.classList.remove("is-rewarded"), 650);
		showToast(message);
	}

	heroTrigger.addEventListener("click", () => {
		heroTrigger.classList.add("has-interacted");
		const rect = heroTrigger.getBoundingClientRect();
		const reserved = $("#hero-reserved-value");
		const available = $("#hero-available-value");
		heroLatched = !heroLatched;
		heroTrigger.setAttribute("aria-pressed", String(heroLatched));
		heroArt.classList.toggle("is-latched", heroLatched);
		$("#hero-promise-card").classList.toggle("is-latched", heroLatched);
		$("#hero-promise-status").textContent = heroLatched
			? "PROMISE SECURED"
			: "INTERACTIVE PREVIEW";
		$("#hero-promise-action-label").textContent = heroLatched
			? "Release 150"
			: "Try reserving 150";
		$("#hero-preview-feedback").textContent = heroLatched
			? "150 reserved. Nothing transferred."
			: "Try it here. Tap again to release.";
		animateNumber(reserved, heroLatched ? 0 : 150, heroLatched ? 150 : 0);
		animateNumber(available, heroLatched ? 500 : 350, heroLatched ? 350 : 500);
		reward(
			rect,
			heroLatched
				? "150.00 LUSD reserved · 0 moved"
				: "150.00 LUSD available again",
		);
	});

	document
		.querySelectorAll<HTMLElement>("[data-wallet-entry]")
		.forEach((entry) => {
			entry.addEventListener(
				"pointerenter",
				() => void loadProtocol().catch(() => {}),
			);
			entry.addEventListener(
				"focus",
				() => void loadProtocol().catch(() => {}),
			);
			entry.addEventListener("click", async (event) => {
				event.preventDefault();
				entry.classList.add("is-connecting");
				const label = entry.querySelector<HTMLElement>(".wallet-entry-label");
				const original = label?.textContent;
				if (label) label.textContent = "Opening Freighter…";
				try {
					const access = await requestAccess();
					if (access.error) throw new Error(access.error.message);
					const network = await getNetwork();
					if (network.error) throw new Error(network.error.message);
					const module = await loadProtocol();
					configureLiveExperience(module);
					window.location.hash = liveRoute();
					await module.openWallet({
						address: access.address,
						networkPassphrase: network.networkPassphrase,
					});
				} catch (error) {
					showToast(
						error instanceof Error
							? error.message
							: "Wallet mode couldn’t open · try again",
					);
				} finally {
					entry.classList.remove("is-connecting");
					if (label && original && !entry.classList.contains("is-connected")) {
						label.textContent = original;
					}
				}
			});
		});

	window.addEventListener("latch:wallet-connected", ((
		event: CustomEvent<{ address: string }>,
	) => {
		walletConnected = true;
		const address = event.detail.address;
		document.querySelectorAll<HTMLElement>(".wallet-entry").forEach((entry) => {
			entry.classList.add("is-connected");
			const label = entry.querySelector<HTMLElement>(".wallet-entry-label");
			if (label)
				label.textContent = `${address.slice(0, 4)}…${address.slice(-4)}`;
		});
		showToast("Freighter connected · Stellar Testnet");
	}) as EventListener);

	$("#scenario-nav").innerHTML = SCENARIOS.map(
		(item, index) =>
			`<a class="scenario-link" href="#app/${item.id}" data-scenario="${item.id}"><span>0${index + 1}</span>${item.category}<span>↗</span></a>`,
	).join("");

	function finishEntry() {
		window.clearTimeout(transitionTimer);
		transition.hidden = true;
		main.inert = false;
		document.body.style.overflow = "";
		if (!application.hidden) {
			(experienceView.hidden ? $("#demo-title") : $("#experience-title")).focus(
				{ preventScroll: true },
			);
		}
	}

	function enterApp() {
		if (reducedMotion.matches) return;
		transition.hidden = false;
		transition.removeAttribute("aria-hidden");
		transition.setAttribute("role", "dialog");
		transition.setAttribute("aria-modal", "true");
		transition.setAttribute("aria-label", "Entering the LATCH experience");
		main.inert = true;
		document.body.style.overflow = "hidden";
		$("#skip-transition").focus({ preventScroll: true });
		transitionTimer = window.setTimeout(finishEntry, 1050);
	}
	$("#skip-transition").addEventListener("click", finishEntry);
	transition.addEventListener("keydown", (event) => {
		if (event.key === "Escape") finishEntry();
		if (event.key === "Tab") {
			event.preventDefault();
			$("#skip-transition").focus();
		}
	});

	function renderInsight() {
		const snap = currentSnapshot();
		const asset = flowAsset();
		const source = liveModeActive ? " on Stellar Testnet" : "";
		const texts: Record<ExperiencePhase, string> = {
			ready: liveModeActive
				? `<strong>Ready for a real signature.</strong> Authorize below to open Freighter, prepare your LATCH account, and reserve ${format(flowMaximum())} XLM${source}.`
				: `<strong>You decide the ceiling.</strong> ${scenario.merchant} can never capture more than the amount you authorize. Start with a simulated 500.00 LUSD balance.`,
			reserved: `<strong>A promise, without a transfer.</strong> ${format(snap.reserved)} ${asset} is reserved inside your account${source}. The merchant has received 0.00. Your other ${format(snap.available)} ${asset} remains available.`,
			delivered: `<strong>Only the final bill moves.</strong> Explore a different bill with the slider. Whatever you don’t owe is released in the same settlement.`,
			settled: `<strong>That’s a promise kept${source}.</strong> ${format(snap.paid)} ${asset} paid. ${format(snap.released)} ${asset} released. There is no refund to wait for — unused capacity never left your account.`,
			released: `<strong>Nothing owed. Nothing moved${source}.</strong> The merchant released the reservation. All ${format(snap.released)} ${asset} is available again.`,
			expired: `<strong>Promises have a time limit.</strong> We advanced the simulated clock past expiry. All ${format(snap.released)} ${asset} is available again, with no merchant capture.`,
		};
		insight.innerHTML = `<span aria-hidden="true">✳</span><p>${texts[phase]}</p>`;
	}

	function renderWallet() {
		const snap = currentSnapshot();
		const active = phase === "reserved" || phase === "delivered";
		const asset = flowAsset();
		const showLiveBalance = !liveModeActive || livePrepared;
		const balance = showLiveBalance ? format(snap.balance) : "—";
		const available = showLiveBalance ? format(snap.available) : "—";
		const reserved = showLiveBalance ? format(snap.reserved) : "—";
		const availableWidth = showLiveBalance
			? (snap.available / Math.max(snap.balance, 1)) * 100
			: 0;
		const reservedWidth = showLiveBalance
			? (snap.reserved / Math.max(snap.balance, 1)) * 100
			: 0;
		wallet.innerHTML = `<div class="wallet-heading"><strong>Your LATCH account</strong><span>${liveModeActive ? "LIVE TESTNET" : "SIMULATED"}</span></div>
      <div class="wallet-total"><span>${liveModeActive ? "On-chain balance" : "Total balance"}</span><strong><span id="experience-balance">${balance}</span> <small>${asset}</small></strong>
      <div class="wallet-capacity" role="img" aria-label="${available} available, ${reserved} reserved"><span style="width:${availableWidth}%"></span><i style="width:${reservedWidth}%"></i></div>
      <div class="wallet-split"><div><span><i class="legend-dot"></i>Available</span><strong id="experience-available">${available}</strong></div><div><span><i class="legend-dot reserved"></i>Reserved</span><strong id="experience-reserved">${reserved}</strong></div></div></div>
      <div class="wallet-hold"><span>${active ? "ACTIVE RESERVATION" : phase === "ready" ? "READY WHEN YOU ARE" : "RESERVATION CLOSED"}</span><strong>${active ? scenario.merchant : phase === "ready" ? "No active promises." : phase === "settled" ? "Settled. All clear." : "Fully released."}</strong><p>${active ? `${format(snap.reserved)} ${asset} · ${scenario.duration}<br />Bound to this merchant only.` : phase === "ready" ? (liveModeActive ? "Authorize below to load your live account." : "Your entire balance is available.<br />You’re in control.") : `Merchant received ${format(snap.paid)} ${asset}.<br />No reserved capacity remains.`}</p></div>
      <div class="wallet-policy"><span aria-hidden="true">⌑</span><p><b>${liveModeActive ? "Signed by Freighter." : "Protected by your account."}</b><br />${liveModeActive ? "Each state change is submitted to Stellar Testnet." : "Reserved funds can’t be spent elsewhere."}</p></div>
      ${active ? `<button type="button" class="overspend-button" data-action="overspend">${liveModeActive ? "Prove an overspend is blocked on-chain" : `Test it: try to spend ${format(snap.available + 100)} LUSD`} ↗</button>` : ""}`;
	}

	function renderProgress() {
		const step = phase === "ready" ? 0 : phase === "reserved" ? 1 : 2;
		const terminal = ["settled", "released", "expired"].includes(phase);
		$("#experience-progress").innerHTML = [
			"Make a promise",
			"Live the experience",
			terminal && phase !== "settled"
				? "Release the hold"
				: "Settle what’s owed",
		]
			.map(
				(label, index) =>
					`<li class="experience-step ${index < step || terminal ? "is-done" : index === step ? "is-current" : ""}" ${index === step ? 'aria-current="step"' : ""}><b>${index < step || terminal ? "✓" : `0${index + 1}`}</b><span>${label}</span></li>`,
			)
			.join("");
	}

	function renderScene() {
		const snap = currentSnapshot();
		const maximum = flowMaximum();
		const asset = flowAsset();
		const photo = `<div class="scene-photo"><img src="./assets/${scenario.image}" alt="${scenario.category === "Hospitality" ? "Your hotel room" : scenario.id === "fuel" ? "Ready for the road" : "Your creative workspace"}" width="1200" height="800"/><span class="simulation-tag${liveModeActive ? " is-live" : ""}">${liveModeActive ? "LIVE · STELLAR TESTNET" : "INTERACTIVE SIMULATION"}</span><div class="scene-location"><span>${scenario.reference}</span><strong>${scenario.merchant}</strong></div></div>`;
		let content = "";
		if (phase === "ready") {
			content = `<span class="eyebrow">A REQUEST, NOT A CHARGE.</span><h2>A little certainty goes a long way.</h2><p>${scenario.description} Your merchant is asking you to reserve a maximum, not pay it upfront.</p>
      <div class="reservation-terms"><div><span>Maximum reservation</span><strong>${format(maximum)} <small>${asset}</small></strong></div><div><span>Reservation expires in</span><strong>${scenario.duration}</strong></div></div>
      <button type="button" class="scene-primary${liveModeActive ? " is-live" : ""}" data-action="authorize">${liveModeActive ? "Open Freighter & authorize" : "Authorize"} ${format(maximum)} ${asset} hold <span>↗</span></button><p class="scene-smallprint">${liveModeActive ? "Real Stellar Testnet transactions · Freighter approval required" : "Simulated authorization · 0 tokens transferred"}</p>`;
		} else if (phase === "reserved") {
			content = `<span class="eyebrow">THE PROMISE IS IN PLACE.</span><h2>${scenario.service}</h2><p>${scenario.serviceCopy}</p><div class="reservation-badge"><i class="status-dot"></i> Merchant verified · ${format(maximum)} ${asset} backed ${liveModeActive ? "on Testnet" : "in this simulation"}</div>
      <button type="button" class="scene-primary" data-action="deliver">${scenario.serviceAction} <span>↗</span></button><div class="scene-secondary-actions"><button type="button" data-action="release">${liveModeActive ? "Release on Testnet" : "Merchant: release hold"}</button>${liveModeActive ? "" : '<button type="button" data-action="expire">Simulate expiry ↗</button>'}</div>`;
		} else if (phase === "delivered") {
			content = `<span class="eyebrow">THE EXPERIENCE IS COMPLETE.</span><h2>Just what you owe.</h2><p>The merchant is ready to settle. Adjust the illustrative bill to see how the unused reservation returns to you.</p>
      <div class="receipt-row"><span>${scenario.item}</span><strong><span id="final-bill-value">${format(finalAmount)}</span> <small>${asset}</small></strong></div>
      <label class="bill-adjust" for="bill-slider"><span>Explore a different final bill <b id="bill-slider-label">${format(finalAmount)} ${asset}</b></span><input id="bill-slider" type="range" min="0" max="${maximum}" step="10" value="${finalAmount}" aria-valuetext="${format(finalAmount)} ${asset}"/><small>From 0.00 to your ${format(maximum)} ${asset} ceiling</small></label>
      <div class="receipt-row"><span>Released at settlement</span><strong><span id="release-preview">${format(maximum - finalAmount)}</span> <small>${asset}</small></strong></div>
      <button type="button" class="scene-primary${liveModeActive ? " is-live" : ""}" data-action="capture">${liveModeActive ? "Sign in Freighter & capture" : "Merchant: capture"} <span id="capture-preview">${format(finalAmount)} ${asset} ↗</span></button><div class="scene-secondary-actions"><button type="button" data-action="release">${liveModeActive ? "Release on Testnet instead" : "Merchant: release instead"}</button>${liveModeActive ? "" : '<button type="button" data-action="expire">Simulate expiry ↗</button>'}</div>`;
		} else {
			content = `<div class="success-icon" aria-hidden="true">✓</div><span class="eyebrow">${phase === "settled" ? "PROMISE KEPT." : phase === "expired" ? "TIME’S UP. FUNDS FREE." : "NO CHARGE. ALL CLEAR."}</span><h2>${phase === "settled" ? "Settled. On your terms." : "Back to full possibility."}</h2><p>${phase === "settled" ? "The merchant received the final amount. The rest is already available in your account." : phase === "expired" ? "The simulated reservation has expired. Its full amount is available again, without a capture." : "The merchant released the hold. No funds were captured and your full balance is available."}</p>
		<div class="receipt-row"><span>Paid to ${scenario.merchant}</span><strong id="experience-paid">${format(snap.paid)} <small>${asset}</small></strong></div><div class="receipt-row"><span>Released from reservation</span><strong id="experience-released">${format(snap.released)} <small>${asset}</small></strong></div>
		<button type="button" class="scene-primary" data-action="next">Try ${scenario.id === "hotel" ? "a fuel reservation" : scenario.id === "fuel" ? "a studio booking" : "a hotel check-in"} <span>↗</span></button><div class="scene-secondary-actions"><button type="button" data-action="restart">Run this experience again</button><a href="#app/${scenario.id}/live">Run it on Testnet ↗</a></div>`;
		}
		scene.innerHTML = `${photo}<div class="scene-content">${content}</div>`;
		const slider = scene.querySelector<HTMLInputElement>("#bill-slider");
		slider?.addEventListener("input", () => {
			finalAmount = Number(slider.value);
			$("#final-bill-value").textContent = format(finalAmount);
			$("#bill-slider-label").textContent = `${format(finalAmount)} ${asset}`;
			$("#release-preview").textContent = format(maximum - finalAmount);
			$("#capture-preview").textContent = `${format(finalAmount)} ${asset} ↗`;
			slider.setAttribute("aria-valuetext", `${format(finalAmount)} ${asset}`);
		});
	}

	function renderExperience() {
		const index = SCENARIOS.findIndex((item) => item.id === scenario.id);
		$("#scenario-category").textContent =
			`0${index + 1} / ${scenario.category}`;
		$("#experience-title").textContent = scenario.name;
		document
			.querySelectorAll<HTMLElement>("[data-scenario]")
			.forEach((link) => {
				const selected = link.dataset.scenario === scenario.id;
				link.classList.toggle("is-active", selected);
				if (selected) link.setAttribute("aria-current", "page");
				else link.removeAttribute("aria-current");
			});
		renderProgress();
		renderScene();
		renderWallet();
		renderInsight();
	}

	function reset() {
		phase = "ready";
		finalAmount = flowActual();
		renderExperience();
	}

	async function submitLiveAction(
		action: "authorize" | "overspend" | "capture" | "release",
		button: HTMLButtonElement,
	) {
		const original = button.innerHTML;
		button.disabled = true;
		button.classList.add("is-pending");
		button.textContent =
			action === "authorize"
				? "Approve the Testnet setup in Freighter…"
				: action === "capture"
					? "Approve capture in Freighter…"
					: action === "release"
						? "Approve release in Freighter…"
						: "Checking the on-chain invariant…";
		showToast("Freighter approval required · Stellar Testnet");
		try {
			let authorized:
				| { address: string; networkPassphrase: string }
				| undefined;
			if (!walletConnected) {
				const access = await requestAccess();
				if (access.error) throw new Error(access.error.message);
				const network = await getNetwork();
				if (network.error) throw new Error(network.error.message);
				authorized = {
					address: access.address,
					networkPassphrase: network.networkPassphrase,
				};
			}
			const module = await loadProtocol();
			configureLiveExperience(module);
			if (authorized) await module.openWallet(authorized);
			const result = await module.runLiveExperienceAction(action, {
				capture: action === "capture" ? finalAmount / 100 : undefined,
			});
			if (result.ok) livePrepared = true;
			return result.ok;
		} catch {
			showToast("The live action couldn’t start · try again");
			return false;
		} finally {
			button.disabled = false;
			button.classList.remove("is-pending");
			button.innerHTML = original;
		}
	}

	$("#restart-experience").addEventListener("click", reset);
	experienceView.addEventListener("click", async (event) => {
		const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
			"button[data-action]",
		);
		if (!button) return;
		const action = button.dataset.action;
		if (action === "restart") {
			reset();
			return;
		}
		if (action === "next") {
			window.location.hash = `app/${SCENARIOS[(SCENARIOS.indexOf(scenario) + 1) % SCENARIOS.length].id}`;
			return;
		}
		if (action === "overspend") {
			if (phase !== "reserved" && phase !== "delivered") return;
			const snap = currentSnapshot();
			if (liveModeActive) {
				const succeeded = await submitLiveAction("overspend", button);
				if (!succeeded) return;
			}
			insight.innerHTML = liveModeActive
				? `<span aria-hidden="true">⌑</span><p><strong>Overspend rejected on-chain.</strong> Stellar simulation confirmed that reserved capacity cannot be spent. No transaction was submitted and the live account state stayed unchanged.</p>`
				: `<span aria-hidden="true">⌑</span><p><strong>Spend blocked. Promise protected.</strong> You tried to spend ${format(snap.available + 100)} LUSD, but only ${format(snap.available)} is available. Your balance is unchanged and ${format(snap.reserved)} LUSD remains reserved. This is a local simulation of the account rule.</p>`;
			button.textContent = "✓ Overspend blocked. Balance unchanged.";
			button.classList.add("is-blocked");
			burst(button.getBoundingClientRect(), true);
			showToast("Spend blocked · your promise stays protected");
			return;
		}
		if (
			action === "authorize" ||
			action === "deliver" ||
			action === "capture" ||
			action === "release" ||
			action === "expire"
		) {
			const rect = button.getBoundingClientRect();
			if (liveModeActive && action !== "deliver") {
				if (action === "expire") return;
				const succeeded = await submitLiveAction(
					action as "authorize" | "capture" | "release",
					button,
				);
				if (!succeeded) return;
			}
			phase = transitionExperience(phase, action);
			renderExperience();
			const maximum = flowMaximum();
			const asset = flowAsset();
			const rewardCopy: Record<string, string> = {
				authorize: `${format(maximum)} ${asset} reserved${liveModeActive ? " on Testnet" : " · 0 moved"}`,
				deliver: "Merchant verified · experience unlocked",
				capture: `${format(finalAmount)} ${asset} settled · ${format(maximum - finalAmount)} released`,
				release: `${format(maximum)} ${asset} released instantly`,
				expire: "Reservation expired · full capacity restored",
			};
			reward(rect, rewardCopy[action]);
			const heading = scene.querySelector<HTMLElement>("h2");
			if (heading) {
				heading.tabIndex = -1;
				heading.focus({ preventScroll: true });
			}
		}
	});

	function route(initial = false) {
		const hash = window.location.hash;
		const params = new URLSearchParams(window.location.search);
		const handoff =
			initial && (params.has("request") || params.has("settlement"));
		const routeParts = hash.replace(/^#/, "").split("/");
		const isLegacyProof = hash === "#proof" || hash === "#demo";
		const isLiveExperience =
			handoff || hash === "#app/live" || routeParts[2] === "live";
		const hasEmbeddedProtocol = isLegacyProof || isLiveExperience;
		const isExperience = hash.startsWith("#app") || isLegacyProof || handoff;
		const isApp = isExperience;
		const wasApp = !application.hidden;
		if (!transition.hidden) finishEntry();
		landing.hidden = isApp;
		$("#site-header").hidden = isApp;
		application.hidden = !isApp;
		experienceView.hidden = !isExperience;
		protocolView.hidden = !hasEmbeddedProtocol;
		$("#experience-tab").classList.toggle("is-active", isExperience);
		$("#proof-tab").classList.toggle("is-active", hasEmbeddedProtocol);
		$("#experience-tab").setAttribute(
			"aria-current",
			isExperience ? "page" : "false",
		);
		$("#proof-tab").setAttribute(
			"aria-current",
			hasEmbeddedProtocol ? "page" : "false",
		);
		if (isExperience) {
			const selected = scenarioById(
				isLegacyProof || handoff ? "hotel" : (routeParts[1] ?? "hotel"),
			);
			const scenarioChanged = selected.id !== scenario.id;
			const modeChanged = liveModeActive !== isLiveExperience;
			scenario = selected;
			liveModeActive = isLiveExperience;
			if (scenarioChanged || modeChanged || !lastRoute) {
				if (modeChanged || scenarioChanged) livePrepared = false;
				reset();
			}
			document.title = `${scenario.category} experience${isLiveExperience ? " · Live Testnet" : ""} — LATCH`;
			$("#experience-modebar").classList.toggle("is-live", isLiveExperience);
			$("#experience-mode-title").textContent = isLiveExperience
				? `Live Testnet · ${scenario.merchant}`
				: "Guided experience";
			$("#experience-mode-copy").textContent = isLiveExperience
				? "The buttons in this experience now open Freighter and submit real Testnet actions."
				: "Learn the flow here, then perform this same use case on Stellar Testnet.";
			$(".experience-bottom > span").textContent = isLiveExperience
				? "LIVE STELLAR TESTNET · FREIGHTER SIGNATURES"
				: "ILLUSTRATIVE EXPERIENCE · LUSD DEMO UNITS";
			$(".sidebar-note small").innerHTML = isLiveExperience
				? "Live Stellar Testnet<br>Freighter signatures required."
				: "Interactive simulation<br>No wallet. No real funds.";
			$("#live-experience-title").textContent =
				`${scenario.name} Now, make it real.`;
			$("#live-experience-copy").textContent =
				`Connect Freighter and run ${scenario.merchant} through the same reserve, verify, and settle lifecycle.`;
			const closeLive = $("#close-live-experience") as HTMLAnchorElement;
			closeLive.href = `#app/${scenario.id}`;
			document
				.querySelectorAll<HTMLAnchorElement>(".experience-bottom a")
				.forEach((link) => {
					link.href = `#app/${scenario.id}/live`;
				});
		}
		if (hasEmbeddedProtocol) {
			void loadProtocol()
				.then((module) => {
					if (!handoff) {
						configureLiveExperience(module);
						$(isLiveExperience ? "#live-mode" : "#replay-mode").click();
					}
				})
				.catch(() => {});
		} else if (!isExperience) document.title = "LATCH";
		if (isApp || wasApp || !hash || hash === "#top")
			window.scrollTo({ top: 0, behavior: "instant" });
		if (!isApp && hash && hash !== "#top") {
			const anchor = document.getElementById(hash.slice(1));
			anchor?.scrollIntoView({
				behavior: reducedMotion.matches ? "instant" : "smooth",
			});
		}
		if (isExperience && !wasApp && !initial) enterApp();
		else if (isApp && !initial)
			$("#experience-title").focus({ preventScroll: true });
		else if (wasApp) $("#site-header .brand").focus({ preventScroll: true });
		lastRoute = hash;
		closeMenu();
	}
	function closeMenu() {
		$("#mobile-nav").hidden = true;
		$("#menu-toggle").setAttribute("aria-expanded", "false");
		$("#menu-toggle").setAttribute("aria-label", "Open navigation");
	}
	$("#menu-toggle").addEventListener("click", () => {
		const menu = $("#mobile-nav");
		menu.hidden = !menu.hidden;
		$("#menu-toggle").setAttribute("aria-expanded", String(!menu.hidden));
		$("#menu-toggle").setAttribute(
			"aria-label",
			menu.hidden ? "Open navigation" : "Close navigation",
		);
	});
	$("#mobile-nav").addEventListener("click", closeMenu);
	window.addEventListener("keydown", (event) => {
		if (event.key === "Escape") closeMenu();
	});
	window.addEventListener("hashchange", () => route());
	$("#demo-title").tabIndex = -1;
	renderExperience();
	route(true);

	if ("IntersectionObserver" in window && !reducedMotion.matches) {
		document.documentElement.classList.add("motion-ready");
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries)
					if (entry.isIntersecting) {
						entry.target.classList.add("is-visible");
						observer.unobserve(entry.target);
					}
			},
			{ threshold: 0.08 },
		);
		document.querySelectorAll(".reveal").forEach((element) => {
			observer.observe(element);
		});
	}
}

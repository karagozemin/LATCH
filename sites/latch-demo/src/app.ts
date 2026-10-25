import { initExperience } from "./experience";
import { TESTNET } from "./testnet-config";

function element<T extends HTMLElement>(selector: string): T {
	const result = document.querySelector<T>(selector);
	if (!result) throw new Error(`Missing app element: ${selector}`);
	return result;
}
const loading = element("#protocol-loading");
const controls = element("#protocol-controls");
const message = element("#protocol-loading-message");
const retry = element<HTMLButtonElement>("#retry-protocol-load");
element<HTMLAnchorElement>("#network-link").href =
	`${TESTNET.explorerBaseUrl}/contract/${TESTNET.proofContract}`;
type ProtocolModule = typeof import("./protocol");
let protocol: Promise<ProtocolModule> | null = null;

function loadProtocol() {
	if (protocol) return protocol;
	loading.hidden = false;
	retry.hidden = true;
	message.textContent = "Opening live Testnet inside this experience…";
	protocol = import("./protocol")
		.then(async (module) => {
			await module.ready;
			document.documentElement.dataset.protocolReady = "true";
			controls.hidden = false;
			loading.hidden = true;
			return module;
		})
		.catch(() => {
			protocol = null;
			message.textContent =
				"Live Testnet couldn’t load. Check your connection and try again.";
			retry.hidden = false;
			throw new Error("Live Testnet could not load");
		});
	return protocol;
}

retry.addEventListener("click", () => window.location.reload());
initExperience(loadProtocol);

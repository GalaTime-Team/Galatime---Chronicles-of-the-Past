export interface ElementWeakness {
    [elementId: string]: number;
}

export interface ElementData {
    id: string;
    name: string;
    description: string;
    type: "common" | string;
    strong_vs?: string[];
    weak_to?: string[];
}

/**
 * Cache de elementos carregados
 */
const elementCache: Map<string, ElementData> = new Map();
let elementsGlob: Record<string, () => Promise<{ default: string }>> | null = null;

/**
 * Inicializa o glob de elementos
 */
async function initializeElementsGlob() {
    if (elementsGlob === null) {
        elementsGlob = import.meta.glob(
            "../../src/data/combat/elements/*.yaml",
            { query: '?raw' }
        ) as Record<string, () => Promise<{ default: string }>>;
    }
}

/**
 * Parse simples de YAML sem dependência externa.
 * Funciona para a estrutura específica dos ficheiros de elemento.
 */
function parseSimpleYaml(content: string): Partial<ElementData> {
    const result: Record<string, unknown> = {};
    const lines = content.split("\n");
    let currentListKey: string | null = null;
    let currentList: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Ignorar linhas vazias e comentários
        if (!trimmed || trimmed.startsWith("#")) {
            if (currentListKey && trimmed === "") {
                result[currentListKey] = currentList;
                currentListKey = null;
                currentList = [];
            }
            continue;
        }

        // Detectar listas (começam com `-`)
        if (trimmed.startsWith("-")) {
            const item = trimmed.substring(1).trim();
            currentList.push(item);
            continue;
        }

        // Se estava processando lista, finalizar
        if (currentListKey) {
            result[currentListKey] = currentList;
            currentListKey = null;
            currentList = [];
        }

        // Detectar pares chave: valor
        const colonIndex = trimmed.indexOf(":");
        if (colonIndex > 0) {
            const key = trimmed.substring(0, colonIndex).trim();
            const valueStr = trimmed.substring(colonIndex + 1).trim();

            // Parse de valores simples
            if (valueStr === "") {
                // Próximas linhas podem ser lista
                currentListKey = key;
                currentList = [];
            } else if (
                valueStr.startsWith('"') &&
                valueStr.endsWith('"') &&
                valueStr.length > 1
            ) {
                // String entre aspas
                result[key] = valueStr.substring(1, valueStr.length - 1);
            } else if (valueStr === "true") {
                result[key] = true;
            } else if (valueStr === "false") {
                result[key] = false;
            } else if (!isNaN(Number(valueStr))) {
                result[key] = Number(valueStr);
            } else {
                // String simples
                result[key] = valueStr;
            }
        }
    }

    // Finalizar lista se ainda há
    if (currentListKey) {
        result[currentListKey] = currentList;
    }

    return result;
}

/**
 * Busca dados de um elemento pelo ID.
 * @param elementId ID do elemento (nome do ficheiro sem extensão)
 * @returns Dados do elemento ou null se não encontrado
 */
export async function getElementData(elementId: string): Promise<ElementData | null> {
    try {
        // Verificar cache
        if (elementCache.has(elementId)) {
            return elementCache.get(elementId) ?? null;
        }

        // Inicializar glob se necessário
        await initializeElementsGlob();

        if (!elementsGlob) {
            console.error("Failed to initialize elements glob");
            return null;
        }

        // Encontrar o ficheiro correspondente
        const globPath = `../data/combat/elements/${elementId}.yaml`;
        const loaderFn = elementsGlob[globPath];

        if (!loaderFn) {
            console.log("loaderFn: ", loaderFn, "globPath: ", globPath, "elementsGlob: ", elementsGlob);
            console.warn(`Element file not found: ${elementId}`);
            return null;
        }

        // Carregar e parsear
        const module = await loaderFn();
        const content = module.default as string;
        const parsed = parseSimpleYaml(content) as unknown as ElementData;

        // Cache
        elementCache.set(elementId, parsed);

        return parsed;
    } catch (error) {
        console.error(`Error loading element data for ${elementId}:`, error);
        return null;
    }
}

/**
 * Busca múltiplos elementos pelo ID.
 * @param elementIds Lista de IDs de elementos
 * @returns Array de dados de elementos (null para elementos não encontrados)
 */
export async function getElementsData(
    elementIds: string[]
): Promise<(ElementData | null)[]> {
    return Promise.all(elementIds.map((id) => getElementData(id)));
}

/**
 * Mapeia as fraquezas de um elemento para um objeto de scores.
 * @param element Dados do elemento
 * @returns Objeto com elementId como chave e score de fraqueza como valor
 */
export function getElementWeaknesses(element: ElementData): ElementWeakness {
    const weaknesses: ElementWeakness = {};

    // Se não tem weak_to definido e é type "common", não tem fraquezas específicas
    if (!element.weak_to || element.weak_to.length === 0) {
        return weaknesses;
    }

    // Cada fraqueza tem score 1 (weak_to)
    for (const weakElement of element.weak_to) {
        weaknesses[weakElement] = 1;
    }

    return weaknesses;
}

/**
 * Mapeia os elementos que o elemento é forte contra para um objeto de scores.
 * @param element Dados do elemento
 * @returns Objeto com elementId como chave e score de força como valor
 */
export function getElementStrengths(element: ElementData): ElementWeakness {
    const strengths: ElementWeakness = {};

    // Se não tem strong_vs definido, não tem vantagens específicas
    if (!element.strong_vs || element.strong_vs.length === 0) {
        return strengths;
    }

    // Cada elemento que é forte contra tem score -1 (strong_vs)
    for (const strongElement of element.strong_vs) {
        strengths[strongElement] = -1;
    }

    return strengths;
}

/**
 * Enumera todos os elementos com type "common".
 * @returns Array de IDs de elementos comum
 */
export async function getCommonElementIds(): Promise<string[]> {
    try {
        // Inicializar glob se necessário
        await initializeElementsGlob();

        if (!elementsGlob) {
            console.error("Failed to initialize elements glob");
            return [];
        }

        const commonIds: string[] = [];

        // Iterar através de todos os ficheiros de elemento
        for (const globPath of Object.keys(elementsGlob)) {
            // Extrair ID do caminho (e.g., "../data/combat/elements/ignis.yaml" -> "ignis")
            const match = globPath.match(/\/([^\/]+)\.yaml$/);
            if (match) {
                const elementId = match[1];
                const elementData = await getElementData(elementId);

                // Verificar se é tipo "common"
                if (elementData && elementData.type === "common") {
                    commonIds.push(elementId);
                }
            }
        }

        return commonIds;
    } catch (error) {
        console.error("Error enumerating common elements:", error);
        return [];
    }
}

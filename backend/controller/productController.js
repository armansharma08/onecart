import uploadOnCloudinary from "../config/cloudinary.js"
import Product from "../model/productModel.js"
import axios from "axios"


export const addProduct = async(req, res) => {
    try {
        let { name, description, price, category, subCategory, sizes, bestseller } = req.body

        let image1 = await uploadOnCloudinary(req.files.image1[0].path)
        let image2 = await uploadOnCloudinary(req.files.image2[0].path)
        let image3 = await uploadOnCloudinary(req.files.image3[0].path)
        let image4 = await uploadOnCloudinary(req.files.image4[0].path)

        let productData = {
            name,
            description,
            price: Number(price),
            category,
            subCategory,
            sizes: JSON.parse(sizes),
            bestseller: bestseller === "true" ? true : false,
            date: Date.now(),
            image1,
            image2,
            image3,
            image4

        }

        const product = await Product.create(productData)

        return res.status(201).json(product)

    } catch (error) {
        console.log("AddProduct error")
        return res.status(500).json({ message: `AddProduct error ${error}` })
    }

}


export const listProduct = async(req, res) => {

    try {
        const product = await Product.find({});
        return res.status(200).json(product)

    } catch (error) {
        console.log("ListProduct error")
        return res.status(500).json({ message: `ListProduct error ${error}` })
    }
}

export const removeProduct = async(req, res) => {
    try {
        let { id } = req.params;
        const product = await Product.findByIdAndDelete(id)
        return res.status(200).json(product)
    } catch (error) {
        console.log("RemoveProduct error")
        return res.status(500).json({ message: `RemoveProduct error ${error}` })
    }

}
const parseJsonFromText = (text) => {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
        return null;
    }

    try {
        return JSON.parse(match[0]);
    } catch (error) {
        return null;
    }
}

const AI_STOP_WORDS = new Set([
    "suggest", "show", "me", "i", "want", "need", "find", "give", "products",
    "product", "item", "items", "under", "below", "less", "than", "within",
    "for", "with", "and", "or", "to", "the", "a", "an", "in", "on", "of"
]);

const parseFallbackFilters = (normalizedQuery) => {
    const budgetMatch = normalizedQuery.match(/(?:under|below|less than|within|max(?:imum)?|upto|up to)\s*₹?\s*(\d+)/);
    const budget = budgetMatch ? Number(budgetMatch[1]) : null;

    let subCategory = "";
    if (normalizedQuery.includes("jacket") || normalizedQuery.includes("hoodie") || normalizedQuery.includes("sweater")) {
        subCategory = "Winterwear";
    }

    const keywords = normalizedQuery
        .split(/[\s,.-]+/)
        .map((word) => word.trim())
        .filter((word) => word && !AI_STOP_WORDS.has(word) && !/^\d+$/.test(word));

    return { budget, category: "", subCategory, keywords };
}

const sanitizeKeywords = (rawKeywords = []) => {
    if (!Array.isArray(rawKeywords)) {
        return [];
    }

    return rawKeywords
        .flatMap((word) => String(word || "").toLowerCase().split(/[\s,.-]+/))
        .map((word) => word.trim())
        .filter((word) => word && !AI_STOP_WORDS.has(word) && !/^\d+$/.test(word));
}

export const aiProductSearch = async(req, res) => {
    try {
        const { query } = req.body;

        if (!query || typeof query !== "string") {
            return res.status(400).json({ message: "Query is required" });
        }

        const products = await Product.find({});
        const normalizedQuery = query.toLowerCase();
        const apiKey = process.env.GOOGLE_API_KEY;
        let budget = null;
        let category = "";
        let subCategory = "";
        let keywords = [];

        if (apiKey) {
            const prompt = `Extract shopping filters from this query and return JSON only.
Query: "${query}"
JSON format:
{
  "budget": number | null,
  "category": string,
  "subCategory": string,
  "keywords": string[]
}
Rules:
- budget should be the maximum price if user says "under", "below", "less than", "within".
- keep category and subCategory empty string if unknown.
- keywords should include useful product intent words only.
- response must be strict JSON, no markdown.`;

            try {
                const result = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                        contents: [{ parts: [{ text: prompt }] }],
                    }, { timeout: 12000 },
                );

                const rawText = result?.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
                const extractedData = parseJsonFromText(rawText);
                if (extractedData) {
                    budget = Number(extractedData?.budget) || null;
                    category = extractedData?.category?.trim() || "";
                    subCategory = extractedData?.subCategory?.trim() || "";
                    keywords = sanitizeKeywords(extractedData?.keywords);
                } else {
                    const fallback = parseFallbackFilters(normalizedQuery);
                    budget = fallback.budget;
                    category = fallback.category;
                    subCategory = fallback.subCategory;
                    keywords = fallback.keywords;
                }
            } catch (geminiError) {
                console.log("Gemini call failed, using fallback parser", geminiError?.message || geminiError);
                const fallback = parseFallbackFilters(normalizedQuery);
                budget = fallback.budget;
                category = fallback.category;
                subCategory = fallback.subCategory;
                keywords = fallback.keywords;
            }
        } else {
            const fallback = parseFallbackFilters(normalizedQuery);
            budget = fallback.budget;
            category = fallback.category;
            subCategory = fallback.subCategory;
            keywords = fallback.keywords;
        }

        let filteredProducts = products.slice();

        if (budget) {
            filteredProducts = filteredProducts.filter((item) => item.price <= budget);
        }
        if (category) {
            filteredProducts = filteredProducts.filter((item) => item.category.toLowerCase() === category.toLowerCase());
        }
        if (subCategory) {
            filteredProducts = filteredProducts.filter((item) => item.subCategory.toLowerCase() === subCategory.toLowerCase());
        }
        if (keywords.length > 0) {
            filteredProducts = filteredProducts.filter((item) => {
                const haystack = `${item.name} ${item.description} ${item.category} ${item.subCategory}`.toLowerCase();
                return keywords.every((word) => haystack.includes(String(word).toLowerCase()));
            });
        }

        return res.status(200).json({
            message: `Found ${filteredProducts.length} product(s) for "${query}"`,
            products: filteredProducts,
            filtersApplied: { budget, category, subCategory, keywords },
        });
    } catch (error) {
        console.log("AiProductSearch error", error);
        return res.status(500).json({ message: `AiProductSearch error ${error.message}` });
    }
}
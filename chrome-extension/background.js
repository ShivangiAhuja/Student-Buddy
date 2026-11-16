// background.js - Handles API calls to Groq with improved LeetCode solution format

const GROQ_API_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request?.action === 'getMentorResponse') {
    handleMentorRequest(request.data)
      .then(response => {
        sendResponse(response);
      })
      .catch(error => {
        sendResponse({ success: false, error: 'Unable to process this request. Check extension settings and try again.' });
      });
    return true;
  }
  
  if (request?.action === 'getSolution') {
    handleSolutionRequest(request.data)
      .then(response => {
        sendResponse(response);
      })
      .catch(error => {
        sendResponse({ success: false, error: 'Unable to process this request. Check extension settings and try again.' });
      });
    return true;
  }
  
  // NEW: Handle correction requests
  if (request?.action === 'correctSolution') {
    handleCorrectionRequest(request.data)
      .then(response => {
        sendResponse(response);
      })
      .catch(error => {
        sendResponse({ success: false, error: 'Unable to process this request. Check extension settings and try again.' });
      });
    return true;
  }
});

async function handleMentorRequest(data) {
  const { problem, userThought, hintLevel, history } = data;
  
  const result = await chrome.storage.sync.get(['apiKey']);
  const apiKey = result.apiKey;
  
  if (!apiKey) {
    return {
      success: false,
      error: 'Please set your Groq API key in the extension settings (click the extension icon)'
    };
  }
  
  const messages = buildMessages(problem, userThought, hintLevel, history);
  
  try {
    
    const mentorMessage = await requestGroq(apiKey, {
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: 0.4,
        max_tokens: 1500,
        top_p: 1,
        stream: false
      });
    
    if (!mentorMessage || mentorMessage.trim() === '') {
      throw new Error('AI response was empty. Please try again.');
    }
    
    return {
      success: true,
      message: mentorMessage
    };
    
  } catch (error) {
    return {
      success: false,
      error: `API Error: ${error.message}`
    };
  }
}

function buildMessages(problem, userThought, hintLevel, history) {
  const systemPrompt = buildSystemPrompt(hintLevel);
  const userPrompt = buildUserPrompt(problem, userThought, hintLevel);
  
  const messages = [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: userPrompt
    }
  ];
  
  return messages;
}

function buildSystemPrompt(hintLevel) {
  const basePrompt = `You are an expert competitive programming tutor with deep knowledge of all LeetCode patterns: dynamic programming, graphs, BFS/DFS, binary search, sliding window, two pointers, tries, heaps, union-find, monotonic stacks, segment trees, and more.

CRITICAL RULES:
- Carefully read the FULL problem including constraints before hinting
- Identify the EXACT correct algorithm for this specific problem
- For medium/hard problems: reason about why the naive approach fails first, then guide toward the optimal
- Be algorithmically precise — vague hints cause wrong answers
- Never give complete code
- If student is on wrong track, clearly say so and redirect`;

  if (hintLevel === 1) {
    return basePrompt + '\n\nHINT LEVEL 1 — Gentle nudge: Ask ONE precise question pointing to the key insight. Example: "What data structure gives O(1) lookups?" Keep it to 2-3 sentences max.';
  } else if (hintLevel === 2) {
    return basePrompt + '\n\nHINT LEVEL 2 — Algorithm reveal: Name the correct algorithm/pattern, explain WHY it fits this problem\'s constraints, and describe the high-level approach. No code. 3-5 sentences.';
  } else if (hintLevel === 3) {
    return basePrompt + '\n\nHINT LEVEL 3 — Step-by-step breakdown: Give numbered steps covering what to initialize, what to iterate over, what to track/update, and what to return. Bold key variables. No code but very specific.';
  }
  
  return basePrompt;
}

function buildUserPrompt(problem, userThought, hintLevel) {
  let prompt = `Problem: ${problem.title}\n\n${problem.description}\n\n`;
  
  if (userThought) {
    prompt += `Student's thought: ${userThought}\n\n`;
  }
  
  if (hintLevel > 0) {
    prompt += `The student is requesting a hint (level ${hintLevel}).`;
  }
  
  return prompt;
}

// IMPROVED: Better solution request handler with LeetCode format preservation
async function handleSolutionRequest(data) {
  const { problem, language, codeTemplate } = data;
  
  
  const result = await chrome.storage.sync.get(['apiKey']);
  const apiKey = result.apiKey;
  
  if (!apiKey) {
    return {
      success: false,
      error: 'Please set your Groq API key in the extension settings'
    };
  }
  
  const targetLanguage = language || 'Python';
  
  // Build improved system prompt
  const systemPrompt = `You are an expert LeetCode solution provider.

CRITICAL RULES FOR LEETCODE FORMAT:
1. When given a class/function template (e.g., "class Solution { public: int func() {} }"), you MUST complete ONLY the function body inside the existing structure
2. NEVER rewrite the entire class from scratch
3. NEVER add extra #include statements, namespace declarations, or main() functions unless they were in the original template
4. Preserve the EXACT function signature, class name, and structure
5. Only fill in the implementation between the curly braces {}

CODE LANGUAGE:
- The solution MUST be in ${targetLanguage} - NO exceptions
- If C++ is selected, use C++ syntax (vectors, iterators, etc.)
- If Java is selected, use Java syntax (ArrayList, Collections, etc.)
- If Python is selected, use Python syntax (lists, comprehensions, etc.)

RESPONSE FORMAT:
## Approach
[2-3 sentence explanation of the algorithm/approach]

## Solution Code (${targetLanguage})
\`\`\`${targetLanguage.toLowerCase()}
[Complete the function body ONLY - keep the class structure intact]
\`\`\`

## Complexity Analysis
Time Complexity: O(...)
Space Complexity: O(...)

## Key Insights
- [Important point 1]
- [Important point 2]
- [Edge cases handled]

EXAMPLES:
If given "class Solution { public: int foo() {} }", return:
\`\`\`cpp
class Solution {
public:
    int foo() {
        // Your implementation here
        return result;
    }
};
\`\`\`

NOT standalone functions, NOT separate helper files.`;

  const userPrompt = `Problem: ${problem.title}

Description:
${problem.description}

${codeTemplate ? `
IMPORTANT - Complete this EXACT template structure:
\`\`\`
${codeTemplate}
\`\`\`

Fill in the function body while preserving the class structure, function signature, and format.
` : `Provide a complete solution in ${targetLanguage}.`}

Language Required: ${targetLanguage}

Remember: Complete the function body inside the existing class structure. Do not rewrite the entire structure.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
  
  try {
    
    const solution = await requestGroq(apiKey, {
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: 0.1,
        max_tokens: 4000,
        top_p: 0.95,
        stream: false
      });
    
    return {
      success: true,
      message: solution
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Failed to get solution: ${error.message}`
    };
  }
}

// NEW: Handle correction requests when solution is wrong
async function handleCorrectionRequest(data) {
  const { problem, language, previousSolution, errorMessage, codeTemplate } = data;
  
  
  const result = await chrome.storage.sync.get(['apiKey']);
  const apiKey = result.apiKey;
  
  if (!apiKey) {
    return {
      success: false,
      error: 'Please set your Groq API key in the extension settings'
    };
  }
  
  const targetLanguage = language || 'Python';
  
  const systemPrompt = `You are an expert LeetCode debugger and solution provider.

The previous solution was INCORRECT. Your task:
1. Analyze what went wrong in the previous solution
2. Provide a CORRECTED solution that fixes the errors
3. Explain what was wrong and how you fixed it

CRITICAL FORMAT RULES:
- Complete the function INSIDE the existing class structure
- Preserve the exact function signature and class format
- Use ${targetLanguage} syntax
- Test the logic mentally before responding

RESPONSE FORMAT:
## What Was Wrong
[Brief explanation of the error in the previous solution]

## Corrected Solution (${targetLanguage})
\`\`\`${targetLanguage.toLowerCase()}
[Complete corrected code with proper class structure]
\`\`\`

## Why This Works
[Explanation of the fix]

## Complexity
Time: O(...)
Space: O(...)`;

  const userPrompt = `Problem: ${problem.title}

${problem.description}

PREVIOUS INCORRECT SOLUTION:
${previousSolution}

${errorMessage ? `ERROR/ISSUE: ${errorMessage}` : 'This solution was marked as incorrect.'}

${codeTemplate ? `
Required template structure:
\`\`\`
${codeTemplate}
\`\`\`
` : ''}

Language: ${targetLanguage}

Please provide a CORRECTED solution that fixes the errors. Analyze the logic carefully and ensure the fix is correct.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
  
  try {
    const correctedSolution = await requestGroq(apiKey, {
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: 0.1,
        max_tokens: 4000,
        top_p: 0.95,
        stream: false
      });
    
    return {
      success: true,
      message: correctedSolution,
      isCorrection: true
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Failed to get correction: ${error.message}`
    };
  }
}

// Shared bounded request handling for hints, solutions, and corrections.
async function requestGroq(apiKey, payload, timeoutMs = 25000) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(GROQ_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    // Do not surface provider bodies: they may echo sensitive request data.
    if (!response.ok) {
      const messages = {
        401: 'API key was rejected. Check extension settings.',
        403: 'API access was denied.',
        429: 'Request limit reached. Please wait before trying again.'
      };
      throw new Error(messages[response.status] || `AI service failed (HTTP ${response.status}). Try again later.`);
    }
    let data;
    try { data = await response.json(); }
    catch { throw new Error('AI service returned invalid JSON. Please try again.'); }
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('AI service returned an empty or malformed response. Please try again.');
    }
    return text;
  } catch (error) {
    if (timedOut) throw new Error('AI request timed out. Please try again.');
    if (error instanceof TypeError) throw new Error('Could not reach the AI service. Check your connection.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

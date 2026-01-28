// background.js - Handles API calls to Groq with improved LeetCode solution format

const GROQ_API_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log('Student Buddy extension started');
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('Student Buddy extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request.action);
  
  if (request.action === 'getMentorResponse') {
    handleMentorRequest(request.data)
      .then(response => {
        console.log('Sending response:', response);
        sendResponse(response);
      })
      .catch(error => {
        console.error('Error in handler:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'getSolution') {
    console.log('getSolution action received in background');
    handleSolutionRequest(request.data)
      .then(response => {
        console.log('Sending solution response:', response);
        sendResponse(response);
      })
      .catch(error => {
        console.error('Error in solution handler:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  // NEW: Handle correction requests
  if (request.action === 'correctSolution') {
    console.log('correctSolution action received');
    handleCorrectionRequest(request.data)
      .then(response => {
        console.log('Sending correction response:', response);
        sendResponse(response);
      })
      .catch(error => {
        console.error('Error in correction handler:', error);
        sendResponse({ success: false, error: error.message });
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
    console.log('Sending request to Groq API...');
    
    const response = await fetch(GROQ_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1024,
        top_p: 1,
        stream: false
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
    }
    
    const responseData = await response.json();
    const mentorMessage = responseData.choices[0].message.content;
    
    if (!mentorMessage || mentorMessage.trim() === '') {
      throw new Error('AI response was empty. Please try again.');
    }
    
    return {
      success: true,
      message: mentorMessage
    };
    
  } catch (error) {
    console.error('Groq API Error:', error);
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
  const basePrompt = `You are a helpful coding tutor guiding a student through programming problems. Your goal is to help them learn by asking questions and providing hints, not by giving complete solutions.

Guidelines:
- Ask guiding questions to help them think through the problem
- Provide hints that point them in the right direction
- Encourage their correct insights
- Gently redirect if they're on the wrong track
- Keep responses concise (2-4 sentences)
- Be encouraging and supportive
- Never provide complete code solutions`;

  if (hintLevel === 1) {
    return basePrompt + '\n\nProvide a GENTLE hint - just a nudge in the right direction.';
  } else if (hintLevel === 2) {
    return basePrompt + '\n\nProvide a MEDIUM hint - mention the approach or algorithm that could work.';
  } else if (hintLevel === 3) {
    return basePrompt + '\n\nProvide a STRONG hint - describe the solution approach in detail without code.';
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
  
  console.log('handleSolutionRequest called with problem:', problem);
  console.log('Requested language:', language || 'Python (default)');
  console.log('Code template:', codeTemplate);
  
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
    console.log('Making API request to Groq...');
    
    const response = await fetch(GROQ_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: 0.1,
        max_tokens: 4000,
        top_p: 0.95,
        stream: false
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `API request failed`);
    }
    
    const responseData = await response.json();
    const solution = responseData.choices[0].message.content;
    
    return {
      success: true,
      message: solution
    };
    
  } catch (error) {
    console.error('Solution fetch error:', error);
    return {
      success: false,
      error: `Failed to get solution: ${error.message}`
    };
  }
}

// NEW: Handle correction requests when solution is wrong
async function handleCorrectionRequest(data) {
  const { problem, language, previousSolution, errorMessage, codeTemplate } = data;
  
  console.log('handleCorrectionRequest called');
  console.log('Previous solution had error:', errorMessage);
  
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
    const response = await fetch(GROQ_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: 0.1,
        max_tokens: 4000,
        top_p: 0.95,
        stream: false
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'API request failed');
    }
    
    const responseData = await response.json();
    const correctedSolution = responseData.choices[0].message.content;
    
    return {
      success: true,
      message: correctedSolution,
      isCorrection: true
    };
    
  } catch (error) {
    console.error('Correction fetch error:', error);
    return {
      success: false,
      error: `Failed to get correction: ${error.message}`
    };
  }
}
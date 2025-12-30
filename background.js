// background.js - Handles API calls to Groq

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
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'getSolution') {
    console.log('getSolution action received in background');
    console.log('Problem data:', request.data);
    
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
});

async function handleMentorRequest(data) {
  const { problem, userThought, hintLevel, history } = data;
  
  // Get API key from storage
  const result = await chrome.storage.sync.get(['apiKey']);
  const apiKey = result.apiKey;
  
  if (!apiKey) {
    return {
      success: false,
      error: 'Please set your Groq API key in the extension settings (click the extension icon)'
    };
  }
  
  // Build the conversation messages
  const messages = buildMessages(problem, userThought, hintLevel, history);
  
  try {
    console.log('Sending request to Groq API...');
    console.log('Messages:', messages);
    
    const response = await fetch(GROQ_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', // Fast and powerful model
        messages: messages,
        temperature: 0.7,
        max_tokens: 1024,
        top_p: 1,
        stream: false
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Groq API Error Response:', errorData);
      throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
    }
    
    const responseData = await response.json();
    console.log('Full Groq API Response:', responseData);
    
    // Extract the message from Groq's response format
    if (!responseData.choices || responseData.choices.length === 0) {
      console.error('Unexpected API response:', responseData);
      throw new Error('No response from AI. Please try again.');
    }
    
    const mentorMessage = responseData.choices[0].message.content;
    
    if (!mentorMessage || mentorMessage.trim() === '') {
      throw new Error('AI response was empty. Please try rephrasing your question.');
    }
    
    return {
      success: true,
      message: mentorMessage
    };
    
  } catch (error) {
    console.error('Groq API Error:', error);
    console.error('Full error details:', error.stack);
    return {
      success: false,
      error: `API Error: ${error.message}`
    };
  }
}

function buildMessages(problem, userThought, hintLevel, history) {
  const systemPrompt = buildSystemPrompt(hintLevel);
  const userPrompt = buildUserPrompt(problem, userThought, hintLevel);
  
  // Build messages in OpenAI format (Groq uses same format)
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

  const levelPrompts = {
    0: '\n\nThe student is sharing their thoughts. Respond to what they said with encouragement or a guiding question.',
    1: '\n\nHINT LEVEL 1 (Gentle): Give a gentle nudge. Ask a question that helps them think about the problem differently. Example: "What data structure allows fast lookups?"',
    2: '\n\nHINT LEVEL 2 (Stronger): Provide a clearer hint about the approach or pattern, but still no complete solution. Example: "Consider using a hash map to store values as you iterate."',
    3: '\n\nHINT LEVEL 3 (Direct): Give a direct pointer toward the solution approach without giving the full answer. Example: "Use a hash map to check if the complement (target - current) exists."'
  };

  return basePrompt + (levelPrompts[hintLevel] || levelPrompts[0]);
}

function buildUserPrompt(problem, userThought, hintLevel) {
  let prompt = `Problem: ${problem.title}\n\n`;
  
  // Include first 400 chars of description
  const shortDesc = problem.description.substring(0, 400);
  prompt += `Description: ${shortDesc}${problem.description.length > 400 ? '...' : ''}\n\n`;
  
  if (userThought && userThought.trim()) {
    prompt += `Student says: "${userThought}"\n\n`;
    prompt += `Please respond as their tutor to guide their thinking.`;
  } else {
    prompt += `The student is asking for a hint (level ${hintLevel}) but hasn't shared their thoughts yet.\n\n`;
    prompt += `Please provide a helpful hint and gently encourage them to share their thinking process.`;
  }
  
  return prompt;
}

async function handleSolutionRequest(data) {
  const { problem, language } = data;
  
  console.log('handleSolutionRequest called with problem:', problem);
  console.log('Requested language:', language || 'Python (default)');
  
  // Get API key from storage
  const result = await chrome.storage.sync.get(['apiKey']);
  const apiKey = result.apiKey;
  
  if (!apiKey) {
    console.error('No API key found');
    return {
      success: false,
      error: 'Please set your Groq API key in the extension settings'
    };
  }
  
  console.log('API key found, preparing solution request');
  
  const targetLanguage = language || 'Python';
  
  const messages = [
    {
      role: 'system',
      content: `You are an expert LeetCode instructor. Provide COMPLETE, WORKING solutions in ${targetLanguage}.

MANDATORY FORMAT:
1. Start with "## Approach" - explain the strategy in 2-3 sentences
2. Then "## Solution Code" - provide COMPLETE working code with detailed comments IN ${targetLanguage}
3. Then "## Complexity" - time and space analysis
4. Then "## Key Insights" - why this solution works

The code MUST:
- Be in ${targetLanguage} specifically
- Be complete and directly runnable
- Include all necessary imports/headers
- Have detailed inline comments
- Use optimal time/space complexity
- Follow LeetCode submission format for ${targetLanguage}

CRITICAL: The solution MUST be in ${targetLanguage}, not any other language.`
    },
    {
      role: 'user',
      content: `Solve this LeetCode problem in ${targetLanguage}:

**${problem.title}**

${problem.description}

Provide a COMPLETE solution in ${targetLanguage} following the mandatory format. The code must be ready to copy-paste into LeetCode and must be written in ${targetLanguage}.`
    }
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
        temperature: 0.1, // Very low for consistent, accurate code
        max_tokens: 4000, // More tokens for complete explanation
        top_p: 0.95,
        stream: false
      })
    });
    
    console.log('API response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Groq API Error Response:', errorData);
      throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
    }
    
    const responseData = await response.json();
    console.log('Solution received, length:', responseData.choices[0]?.message?.content?.length);
    
    if (!responseData.choices || responseData.choices.length === 0) {
      throw new Error('No solution received from AI');
    }
    
    const solution = responseData.choices[0].message.content;
    
    console.log('Returning successful solution');
    
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
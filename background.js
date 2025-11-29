// background.js - Handles API calls to Gemini

const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
});

async function handleMentorRequest(data) {
  const { problem, userThought, hintLevel, history } = data;
  
  // Get API key from storage
  const result = await chrome.storage.sync.get(['apiKey']);
  const apiKey = result.apiKey;
  
  if (!apiKey) {
    return {
      success: false,
      error: 'Please set your Gemini API key in the extension settings (click the extension icon)'
    };
  }
  
  // Construct the prompt
  const systemPrompt = buildSystemPrompt(hintLevel);
  const userPrompt = buildUserPrompt(problem, userThought, hintLevel);
  
  // Combine into single message for better API compatibility
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
  
  try {
    const requestBody = {
      contents: [
        {
          parts: [
            { text: fullPrompt }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.9,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      }
    };
    
    console.log('Sending request to Gemini API...');
    console.log('Prompt length:', fullPrompt.length);
    
    const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error Response:', errorData);
      throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
    }
    
    const responseData = await response.json();
    console.log('Full API Response:', responseData);
    
    // Check if response has the expected structure
    if (!responseData.candidates || responseData.candidates.length === 0) {
      console.error('Unexpected API response:', responseData);
      
      // Check if content was blocked
      if (responseData.promptFeedback?.blockReason) {
        throw new Error(`Content was blocked: ${responseData.promptFeedback.blockReason}`);
      }
      
      throw new Error('No response from AI. The content might have been blocked or the API format changed.');
    }
    
    // Check if the candidate has content
    const candidate = responseData.candidates[0];
    
    // Check for finish reason
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      console.error('Content blocked. Finish reason:', candidate.finishReason);
      console.error('Safety ratings:', candidate.safetyRatings);
      throw new Error(`Response blocked due to: ${candidate.finishReason}. Try asking in a different way.`);
    }
    
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      console.error('Candidate has no content:', candidate);
      throw new Error('AI response was empty. Try rephrasing your question.');
    }
    
    const mentorMessage = candidate.content.parts[0].text;
    
    return {
      success: true,
      message: mentorMessage
    };
    
  } catch (error) {
    console.error('Gemini API Error:', error);
    console.error('Full error details:', error.stack);
    return {
      success: false,
      error: `API Error: ${error.message}. Check the console for details.`
    };
  }
}

function buildSystemPrompt(hintLevel) {
  const basePrompt = `You are a helpful coding tutor guiding a student through a programming problem. Your goal is to help them learn by asking questions and providing hints, not by giving complete solutions.

Guidelines:
- Ask guiding questions to help them think through the problem
- Provide hints that point them in the right direction
- Encourage their correct insights
- Gently redirect if they're on the wrong track
- Keep responses concise (2-4 sentences)
- Be encouraging and supportive`;

  const levelPrompts = {
    0: '\n\nThe student is sharing their thoughts. Respond to what they said with encouragement or a guiding question.',
    1: '\n\nHINT LEVEL 1: Give a gentle nudge. Ask a question that helps them think about the problem differently.',
    2: '\n\nHINT LEVEL 2: Provide a clearer hint about the approach or pattern, but still no complete solution.',
    3: '\n\nHINT LEVEL 3: Give a direct pointer toward the solution approach without giving the full answer.'
  };

  return basePrompt + (levelPrompts[hintLevel] || levelPrompts[0]);
}

function buildUserPrompt(problem, userThought, hintLevel) {
  let prompt = `Problem: ${problem.title}\n\n`;
  
  // Only include first 300 chars of description to avoid issues
  const shortDesc = problem.description.substring(0, 300);
  prompt += `Description: ${shortDesc}...\n\n`;
  
  if (userThought && userThought.trim()) {
    prompt += `Student says: "${userThought}"\n\n`;
    prompt += `Please respond as their tutor.`;
  } else {
    // Student clicked a hint button without typing
    prompt += `The student needs help getting started.\n\n`;
    prompt += `Please provide a helpful hint.`;
  }
  
  return prompt;
}
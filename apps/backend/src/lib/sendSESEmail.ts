import AWS from '../config/aws-config';

interface EmailParams {
  to: string;
  templateName: string;
  templateData: Record<string, any>;
}

/**
 * Sends a templated email using AWS SES SDK
 * @param {EmailParams} params - Email parameters
 * @returns {Promise<AWS.SES.SendTemplatedEmailResponse>} Response from SES email send operation
 */
async function sendSESEmail({ to, templateName, templateData }: EmailParams): Promise<AWS.SES.SendTemplatedEmailResponse> {
  const ses = new AWS.SES();

  const params: AWS.SES.SendTemplatedEmailRequest = {
    Source: process.env.EMAIL_USER!,
    Destination: {
      ToAddresses: [to]
    },
    Template: templateName,
    TemplateData: JSON.stringify(templateData)
  };

  try {
    const result = await ses.sendTemplatedEmail(params).promise();
    return result;
  } catch (error) {
    console.error('Error sending SES templated email:', error);
    throw error;
  }
}

export default sendSESEmail;

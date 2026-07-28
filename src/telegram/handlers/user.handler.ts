import { Injectable } from '@nestjs/common';

@Injectable()
export class UserHandler {
  buildNewUserMessage(data: {
    fullName: string;
    username: string;
    email: string;
    phoneNumber: string;

    referred: boolean;

    referredBy?: {
      fullName: string;
      username: string;
    };
  }) {
    return `
✅ NEW USER VERIFIED

Name: ${data.fullName}
Username: ${data.username}
Email: ${data.email}
Phone: ${data.phoneNumber}

Referral: ${data.referred ? '✅ Yes' : '❌ No'}${
      data.referredBy
        ? `

Referrer:
Name: ${data.referredBy.fullName}
Username: ${data.referredBy.username}`
        : ''
    }
`;
  }

  buildNewRegistrationMessage(data: {
    fullName: string;
    username: string;
    email: string;
    phoneNumber: string;
    referred: boolean;
  }) {
    return `
📝 NEW REGISTRATION STARTED

Name: ${data.fullName}
Username: ${data.username}
Email: ${data.email}
Phone: ${data.phoneNumber}

Referral: ${data.referred ? '✅ Yes' : '❌ No'}

Status: ⏳ Pending email verification
`;
  }
}

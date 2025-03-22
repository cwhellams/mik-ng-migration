import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Grid,
  Typography,
  IconButton,
  useMediaQuery,
  useTheme,
  CircularProgress
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@iconify/react';
import { Member } from '@backend/routes/members/models';

interface EditMemberModalProps {
  open: boolean;
  onClose: () => void;
  mode: 'personalInfo' | 'emergencyContact';
  memberData?: Member;
  onSave: (updatedData: Partial<Member>) => Promise<void>;
}

const EditMemberModal = ({ open, onClose, mode, memberData, onSave }: EditMemberModalProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down('sm'));
  const [loading, setLoading] = useState(false);

  // Define form states based on the mode
  const [formData, setFormData] = useState<Partial<Member>>({});

  // Initialize form data when modal opens or memberData changes
  useEffect(() => {
    if (memberData) {
      if (mode === 'personalInfo') {
        setFormData({
          firstName: memberData.firstName,
          lastName: memberData.lastName,
          phoneNumber: memberData.phoneNumber || '',
          streetAddress: memberData.streetAddress || '',
          postcode: memberData.postcode || '',
          townCity: memberData.townCity || '',
        });
      } else {
        setFormData({
          iceContactName: memberData.iceContactName || '',
          iceContactPhoneNumber: memberData.iceContactPhoneNumber || '',
        });
      }
    }
  }, [memberData, mode, open]);

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving member data:', error);
      // Could add error handling / feedback here
    } finally {
      setLoading(false);
    }
  };

  const renderPersonalInfoForm = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6}>
        <TextField
          fullWidth
          label={t('member.firstName')}
          value={formData.firstName || ''}
          onChange={handleChange('firstName')}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          fullWidth
          label={t('member.lastName')}
          value={formData.lastName || ''}
          onChange={handleChange('lastName')}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label={t('member.phone')}
          value={formData.phoneNumber || ''}
          onChange={handleChange('phoneNumber')}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label={t('member.streetAddress')}
          value={formData.streetAddress || ''}
          onChange={handleChange('streetAddress')}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          fullWidth
          label={t('member.postcode')}
          value={formData.postcode || ''}
          onChange={handleChange('postcode')}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          fullWidth
          label={t('member.town')}
          value={formData.townCity || ''}
          onChange={handleChange('townCity')}
        />
      </Grid>
    </Grid>
  );

  const renderEmergencyContactForm = () => (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label={t('member.iceContact')}
          value={formData.iceContactName || ''}
          onChange={handleChange('iceContactName')}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label={t('member.icePhone')}
          value={formData.iceContactPhoneNumber || ''}
          onChange={handleChange('iceContactPhoneNumber')}
        />
      </Grid>
    </Grid>
  );

  const getTitle = () => {
    return mode === 'personalInfo'
      ? t('member.editPersonInfo', 'Edit Personal Information')
      : t('member.editEmergencyContact', 'Edit Emergency Contact');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isXs}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">
            {getTitle()}
          </Typography>
          <IconButton onClick={onClose} aria-label="close">
            <Icon icon="mdi:close" />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {mode === 'personalInfo' ? renderPersonalInfoForm() : renderEmergencyContactForm()}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit">
          {t('general.cancel', 'Cancel')}
        </Button>
        <Button
          onClick={handleSubmit}
          color="primary"
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {t('general.save', 'Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditMemberModal;